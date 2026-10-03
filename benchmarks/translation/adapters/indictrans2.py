"""IndicTrans2 worker: English -> Indic via AI4Bharat checkpoints.

Stays faithful to the official workflow: per-language preprocessing with the
IndicTransToolkit IndicProcessor when installed (normalization + script
handling), FLORES language tags as decoder-start tokens, beam search.
Falls back to plain tagged generation only if the toolkit is missing
(a warning is printed; quality will be lower).

Protocol: argv --model <hf-id>; reads {"id","text","tgt"} JSON lines on
stdin, writes {"id","text": ...} or {"id","error": ...} lines on stdout.
"""
import argparse
import json
import os
import sys

FLORES = {
    "Telugu": "tel_Telu",
    "Tamil": "tam_Taml",
    "Hindi": "hin_Deva",
    "Kannada": "kan_Knda",
    "Malayalam": "mal_Mlym",
}

SRC = "eng_Latn"


def load_processor():
    try:
        from IndicTransToolkit.processor import IndicProcessor  # pip: indictrans
    except Exception:
        try:
            from indictrans import IndicProcessor  # type: ignore
        except Exception:
            print("WARN: IndicTransToolkit not installed; using raw text", file=sys.stderr)
            return None
    try:
        return IndicProcessor(inference=True)
    except Exception as exc:
        print(f"WARN: IndicProcessor init failed ({exc}); using raw text", file=sys.stderr)
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="ai4bharat/indictrans2-en-indic-1B")
    ap.add_argument("--beams", type=int, default=int(os.environ.get("IT2_BEAMS", "2")))
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(args.model, trust_remote_code=True)
    model.eval()
    if torch.cuda.is_available():
        model = model.cuda()
    ip = load_processor()

    def preprocess(text: str, src: str):
        if ip is None:
            return [text], None
        batch = ip.preprocess_batch([text], src_lang=src)
        return batch, src

    def postprocess(sentences, tgt: str):
        if ip is None:
            return sentences
        return ip.postprocess_batch(sentences, lang=tgt)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            tgt = req["tgt"]  # FLORES code, mapped by the TS adapter
            batch, src_used = preprocess(req["text"], SRC)
            inputs = tok(batch, return_tensors="pt", padding=True, truncation=True, max_length=512)
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
            decoded = tok.batch_decode(out, skip_special_tokens=True)
            final = postprocess(decoded, tgt)
            sys.stdout.write(json.dumps({"id": req["id"], "text": final[0].strip()}) + "\n")
            sys.stdout.flush()
        except Exception as exc:  # never kill the worker on one bad case
            sys.stdout.write(json.dumps({"id": (json.loads(line).get("id") if line.startswith("{") else "?"), "error": str(exc)[:200]}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
