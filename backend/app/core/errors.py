from typing import Any, Dict, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


class APIException(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.headers = headers or {}
        super().__init__(message)


def format_validation_errors(exc: RequestValidationError) -> list:
    fields = []
    for error in exc.errors():
        loc = error.get("loc", ())
        # Convert ('body', 'items', 0, 'quantity') -> 'items[0].quantity'
        path_parts = []
        for part in loc:
            if part in ("body",):
                continue
            if isinstance(part, int):
                if path_parts:
                    path_parts[-1] = f"{path_parts[-1]}[{part}]"
                else:
                    path_parts.append(f"[{part}]")
            else:
                path_parts.append(str(part))
        
        path = ".".join(path_parts) if path_parts else "body"
        rule = error.get("type", "invalid")
        msg = error.get("msg", "Invalid value.")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        fields.append({
            "path": path,
            "rule": rule,
            "message": msg
        })
    return fields


async def api_exception_handler(request: Request, exc: APIException) -> JSONResponse:
    content = {
        "error": {
            "code": exc.code,
            "message": exc.message,
            "details": exc.details
        }
    }
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = format_validation_errors(exc)
    content = {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Some fields are invalid.",
            "details": {
                "fields": fields
            }
        }
    }
    return JSONResponse(status_code=422, content=content)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    # Map common status codes to standard contract codes
    status_code = exc.status_code
    code = "BAD_REQUEST"
    if status_code == 401:
        code = "UNAUTHENTICATED"
    elif status_code == 403:
        code = "FORBIDDEN"
    elif status_code == 404:
        code = "NOT_FOUND"
    elif status_code == 405:
        code = "METHOD_NOT_ALLOWED"
    elif status_code == 409:
        code = "CONFLICT"
    elif status_code == 413:
        code = "PAYLOAD_TOO_LARGE"
    elif status_code == 415:
        code = "UNSUPPORTED_MEDIA_TYPE"
    elif status_code == 429:
        code = "RATE_LIMITED"
    elif status_code >= 500:
        code = "INTERNAL_ERROR"

    message = str(exc.detail) if exc.detail else "An error occurred."
    content = {
        "error": {
            "code": code,
            "message": message,
            "details": {}
        }
    }
    headers = getattr(exc, "headers", None) or {}
    return JSONResponse(status_code=status_code, content=content, headers=headers)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = request.headers.get("X-Request-ID", "unknown")
    content = {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. Please try again later.",
            "details": {"request_id": request_id}
        }
    }
    return JSONResponse(status_code=500, content=content)
