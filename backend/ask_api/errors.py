class AskError(Exception):
    """An error whose message is safe to show the user (never contains a key)."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def provider_error(status: int, detail: str, model: str, who: str = "The model provider") -> AskError:
    if status in (401, 403) or (status == 400 and "api key" in detail.lower()):
        return AskError("invalid_key", "The API key was rejected. Check that it is correct, active and allowed to use this model.", 401)
    if status == 402 or "credit" in detail.lower() or "billing" in detail.lower():
        return AskError("insufficient_credit", f"{who} says this account has insufficient credit. Add credit, then try again.", 402)
    if status == 429:
        return AskError("rate_limited", f"{who} is rate-limiting this key. Wait a moment and try again.", 429)
    if status == 404:
        return AskError("model_error", f'The model "{model}" is not available to this key. Check the model name.', 400)
    if status >= 500:
        return AskError("overloaded", f"{who} is temporarily unavailable. Try again shortly.", 503)
    return AskError("bad_request", f"{who} rejected the request" + (f": {detail[:200]}" if detail else "."), 400)
