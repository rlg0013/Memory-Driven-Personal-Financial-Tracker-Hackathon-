import os
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

def test_anthropic():
    key = os.getenv("ANTHROPIC_API_KEY")
    try:
        client = Anthropic(api_key=key)
        resp = client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=10,
            messages=[{"role": "user", "content": "Hi"}]
        )
        print("Success!")
    except Exception as e:
        print("\n--- EXACT ERROR ---")
        print(str(e))
        print("-------------------")

if __name__ == "__main__":
    test_anthropic()
