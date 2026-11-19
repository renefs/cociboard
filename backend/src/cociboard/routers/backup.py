"""``/api/backup`` endpoints: download everything as JSON, or replace everything from a file."""

import json
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from sqlmodel import Session

from cociboard.backup import MAX_BACKUP_BYTES, BackupValidationError, RestoreResult, parse_backup
from cociboard.backup_repo import export_backup, restore_backup
from cociboard.db import get_session
from cociboard.routers.weeks import get_today

router = APIRouter(prefix="/backup", tags=["backup"])

SessionDep = Annotated[Session, Depends(get_session)]


def _invalid(code: str, **params: str | int) -> HTTPException:
    """422 with ``detail: {code, message, params}`` (clients translate from the code)."""
    return HTTPException(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail={"code": code, "message": f"Invalid backup: {code}", "params": params},
    )


@router.get("")
def download_backup(
    session: SessionDep, today: Annotated[date, Depends(get_today)]
) -> JSONResponse:
    """Everything (recipes, planned meals, shopping lists) as a downloadable JSON file."""
    document = export_backup(session)
    return JSONResponse(
        document.model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="cociboard-backup-{today}.json"'},
    )


@router.post("/restore", response_model=RestoreResult)
async def restore(request: Request, session: SessionDep) -> RestoreResult:
    """Replace all data with the uploaded backup, in one transaction.

    The whole document is validated first (422 with a ``code``); bodies over 10 MB get 413.
    A file-based SQLite database is copied to ``*.bak-pre-restore-*`` before anything changes.
    """
    declared = request.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > MAX_BACKUP_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Backup file is too large")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BACKUP_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Backup file is too large")
    try:
        data = json.loads(body)
    except ValueError:
        raise _invalid("invalid_document") from None
    try:
        document = parse_backup(data)
    except BackupValidationError as exc:
        raise _invalid(exc.code, **exc.params) from None
    return await run_in_threadpool(restore_backup, session, document)
