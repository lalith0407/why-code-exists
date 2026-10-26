"""
Corroboration (optional, never a gate) for the litellm video/deployment-hook case.
Runs the REAL litellm code path (litellm.Router.avideo_generation) from a given checkout. The ONLY stand-in is the external video provider:
api.openai.com is mocked at the HTTP boundary with respx (no network, no key). The custom callback below is the "chat-shaped hook" scenario
described in the fix PR's reproduction section (BerriAI/litellm#42535) -- i.e. this scenario is ground-truth-informed, which is why this
script is corroboration only and is never shown to the engine.
Prints one JSON line: {checkout, outcome, error, provider_calls}.
"""
import asyncio, json, sys
import httpx, respx
import litellm
from litellm.integrations.custom_logger import CustomLogger

class ChatShapedHook(CustomLogger):  # a callback written for chat responses (reads .choices)
    async def async_post_call_success_deployment_hook(self, request_data, response, call_type):
        _ = response.choices[0].message.content
        return None

VIDEO = {"id": "video_abc", "object": "video", "status": "queued", "model": "sora-2", "created_at": 1758500000, "progress": 0, "seconds": "4", "size": "720x1280"}

# Transport choice: litellm defaults to an aiohttp transport that respx cannot intercept; switch to its httpx transport so the mock sits at the HTTP boundary.
litellm.disable_aiohttp_transport = True

async def main():
    litellm.callbacks = [ChatShapedHook()]
    router = litellm.Router(model_list=[{"model_name": "sora-2", "litellm_params": {"model": "openai/sora-2", "api_key": "sk-test-not-a-real-key"}}])
    with respx.mock(assert_all_called=False) as m:
        route = m.post("https://api.openai.com/v1/videos").mock(return_value=httpx.Response(200, json=VIDEO))
        out = {"checkout": sys.argv[1], "outcome": None, "error": None}
        try:
            r = await router.avideo_generation(model="sora-2", prompt="a cat", seconds="4", size="720x1280")
            out["outcome"] = "ok"; out["response_type"] = type(r).__name__
        except Exception as e:
            out["outcome"] = "error"; out["error"] = f"{type(e).__name__}: {str(e)[:300]}"
        out["provider_calls"] = route.call_count
    print(json.dumps(out))

asyncio.run(main())
