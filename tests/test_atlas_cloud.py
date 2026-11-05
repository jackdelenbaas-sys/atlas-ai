import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("atlas_cloud", ROOT / "atlas-cloud-bridge.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)

class AtlasCloudTests(unittest.TestCase):
    def test_chat_history_and_image(self):
        payload = {
            "history": [{"role": "user", "text": "Hello"}, {"role": "assistant", "text": "Hi"}],
            "text": "What is in this photo?",
            "attachments": [{"name": "test.jpg", "type": "image/jpeg",
                             "data": "data:image/jpeg;base64,AA=="}],
        }
        messages = bridge.clean_input(payload)
        self.assertEqual(len(messages), 3)
        self.assertEqual(messages[-1]["role"], "user")
        self.assertEqual(messages[-1]["content"][1]["type"], "input_image")

    def test_multiple_text_files_and_video_frames(self):
        payload = {"text": "Analyze both", "attachments": [
            {"name": "a.txt", "type": "text/plain", "text": "alpha"},
            {"name": "b.csv", "type": "text/plain", "text": "one,two"},
            {"name": "clip.mp4", "type": "video/mp4",
             "frames": ["data:image/jpeg;base64,AA=="]},
        ]}
        items = bridge.clean_input(payload)[-1]["content"]
        self.assertEqual(sum(x["type"] == "input_text" for x in items), 4)
        self.assertEqual(sum(x["type"] == "input_image" for x in items), 1)

    def test_non_user_messages_are_ignored(self):
        payload = {"text": "Test", "history": [
            {"role": "system", "text": "inject"},
            {"role": "assistant", "text": "correct"},
        ]}
        messages = bridge.clean_input(payload)
        self.assertEqual(len(messages), 2)

    def test_extracts_citations_images_and_text(self):
        raw = {"output": [
            {"type": "message", "content": [{"type": "output_text",
             "text": "Answer", "annotations": [{"type": "url_citation",
             "title": "Example", "url": "https://example.com"}]}]},
            {"type": "image_generation_call", "result": "AA=="},
        ]}
        result = bridge.extract_response(raw)
        self.assertEqual(result["text"], "Answer")
        self.assertEqual(result["sources"][0]["title"], "Example")
        self.assertTrue(result["images"][0].startswith("data:image/png;base64,"))

if __name__ == "__main__":
    unittest.main()
