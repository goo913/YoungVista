"""Errors the job reports to the phone in plain words (never naming a model or provider)."""


class CaptureError(Exception):
    """The capture cannot be measured. `message` is shown to the user; `code` is for the team."""

    def __init__(self, code: str, message: str, detail: str | None = None):
        super().__init__(f"{code}: {detail or message}")
        self.code = code
        self.message = message
        self.detail = detail


MESSAGES = {
    "version": "This scan was made by a newer app than the server knows. Update the app and scan again.",
    "format": "The scan's camera data doesn't line up. Update the app and scan again.",
    "missing": "Some of the scan's pictures didn't upload. Scan the room again.",
    "too-few": "The scan has too few pictures. Turn all the way around on each ring, slowly.",
    "tracking": "The phone lost track of the room while turning. Turn more slowly with the lights on, and scan again.",
    "coverage": "Part of the room was missed. Turn all the way around on each ring, slowly, and scan again.",
    "floor": "The scan didn't find the floor. Point the phone at the floor until it's found, then turn around again.",
    "walls": "The walls couldn't be found from this scan. Mark them by hand instead.",
    "server": "Something went wrong while measuring the room. Try again, or mark the walls by hand.",
    "timeout": "Measuring the room took too long. Try again, or mark the walls by hand.",
}


def capture_error(code: str, detail: str | None = None) -> CaptureError:
    return CaptureError(code, MESSAGES[code], detail)
