"""NLLB-200 worker (baseline): English -> target via facebook checkpoints.

Standard HF workflow: source-lang tag on the tokenizer, forced BOS token
for the target language. FLORES-200 codes throughout.

Protocol: argv --model <hf-id>; reads {"id","text","tgt"} JSON lines on
stdin, writes {"id","text": ...} or {"id","error": ...} lines on stdout.
"""
import argparse
import json
import os
import sys

SRC = "eng_Latn"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="facebook/nllb-200-distilled-600M")
    ap.add_argument("--beams", type=int, default=int(os.environ.get("NLLB_BEAMS", "2")))
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model)
    model.eval()
    if torch.cuda.is_available():
        model = model.cuda()
    tok.src_lang = SRC

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            tgt = req["tgt"]
            inputs = tok(req["text"], return_tensors="pt", truncation=True, max_length=512)
            if torch.cuda.is_available():
                inputs = {k: v.cuda() for k, v in inputs.items()}
            bos = tok.convert_tokens_to_ids(tgt)
            with torch.no_grad():
                out = model.generate(
                    **inputs,
                    forced_bos_token_id=bos,
                    num_beams=args.beams,
                    max_new_tokens=256,
                )
            text = tok.batch_decode(out, skip_special_tokens=True)[0].strip()
            sys.stdout.write(json.dumps({"id": req["id"], "text": text}) + "\n")
            sys.stdout.flush()
        except Exception as exc:  # never kill the worker on one bad case
            try:
                rid = json.loads(line).get("id", "?")
            except Exception:
                rid = "?"
            sys.stdout.write(json.dumps({"id": rid, "error": str(exc)[:200]}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
