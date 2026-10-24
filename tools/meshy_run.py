#!/usr/bin/env python3
"""One guarded Meshy run for the 3D avatar test.

Single lock, skips finished jobs, no retries, stops the whole batch on the
first failure (HTTP error, FAILED task, timeout, bad JSON) and persists a block
that a later run refuses to pass. The key is read from ~/.config/meshy/api_key
and never printed.

Jobs file: [{"id", "endpoint", "body"}]. In the body, "@img:<path>" becomes a
base64 data URI of that file and "@task:<job id>" becomes the Meshy task id of
an earlier job. Results land in art/meshy/<id>/ (task.json plus the GLBs).
Run with --dry to print the requests without sending anything.
"""
import base64, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "art" / "meshy"
LOCK, BLOCK, LOG = OUT / "RUN.lock", OUT / "BLOCKED.json", OUT / "run.log"
API = "https://api.meshy.ai/openapi/v1/"
POLL, LIMIT = 10, 20 * 60


def log(msg):
    line = time.strftime("%H:%M:%S ") + msg
    print(line, flush=True)
    with open(LOG, "a") as f:
        f.write(line + "\n")


def key():
    return (Path.home() / ".config/meshy/api_key").read_text().strip()


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": "Bearer " + key(), "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def resolve(v, done):
    if isinstance(v, str) and v.startswith("@img:"):
        p = ROOT / v[5:]
        mime = "image/png" if p.suffix == ".png" else "image/jpeg"
        return "data:%s;base64,%s" % (mime, base64.b64encode(p.read_bytes()).decode())
    if isinstance(v, str) and v.startswith("@task:"):
        return done[v[6:]]
    if isinstance(v, list):
        return [resolve(x, done) for x in v]
    if isinstance(v, dict):
        return {k: resolve(x, done) for k, x in v.items()}
    return v


def urls(obj, prefix=""):
    """Every .glb link in a finished task, keyed by where it sits."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from urls(v, prefix + k + ".")
    elif isinstance(obj, str) and obj.startswith("http") and ".glb" in obj.split("?")[0]:
        yield prefix.rstrip("."), obj


def block(jid, why):
    BLOCK.write_text(json.dumps({"item": jid, "why": why, "at": time.ctime()}, indent=1))
    sys.exit(f"stopped at {jid}; see {BLOCK}")


def main():
    dry = "--dry" in sys.argv
    args = [a for a in sys.argv[1:] if a != "--dry"]
    if BLOCK.exists():
        sys.exit("BLOCKED: " + BLOCK.read_text())
    jobs = json.loads(Path(args[0]).read_text())
    if dry:
        done = {j["id"]: "<task of %s>" % j["id"] for j in jobs}
        for j in jobs:
            body = resolve(j["body"], done)
            short = json.dumps(body, default=str)
            print(j["id"], j["endpoint"], len(short), "bytes", {k: (v if len(str(v)) < 80 else "...") for k, v in body.items()})
        return
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        sys.exit("another run holds the lock")
    os.write(fd, str(os.getpid()).encode()); os.close(fd)
    try:
        done = {}
        for j in jobs:
            d = OUT / j["id"]; tf = d / "task.json"
            if tf.exists() and json.loads(tf.read_text()).get("status") == "SUCCEEDED":
                done[j["id"]] = json.loads(tf.read_text())["id"]
                log("skip " + j["id"]); continue
            d.mkdir(parents=True, exist_ok=True)
            try:
                tid = call("POST", j["endpoint"], resolve(j["body"], done))["result"]
            except (urllib.error.URLError, ValueError, KeyError) as e:
                body = e.read().decode()[:600] if isinstance(e, urllib.error.HTTPError) else ""
                block(j["id"], "create: %r %s" % (e, body))
            (d / "task_id").write_text(tid)
            log("%s created %s" % (j["id"], tid))
            t0 = time.time()
            while True:
                time.sleep(POLL)
                try:
                    t = call("GET", "%s/%s" % (j["endpoint"], tid))
                except (urllib.error.URLError, ValueError) as e:
                    block(j["id"], "poll: %r" % e)
                st = t.get("status")
                if st == "SUCCEEDED":
                    break
                if st in ("FAILED", "CANCELED", "EXPIRED"):
                    tf.write_text(json.dumps(t, indent=1))
                    block(j["id"], "task %s: %s" % (st, t.get("task_error")))
                if time.time() - t0 > LIMIT:
                    block(j["id"], "timeout after %ds at %s%%" % (LIMIT, t.get("progress")))
            tf.write_text(json.dumps(t, indent=1))
            for name, u in urls(t):
                p = d / (name.replace("model_urls.", "").replace("result.", "").replace(".", "_") + ".glb")
                urllib.request.urlretrieve(u, p)
            log("%s done in %ds, %s credits" % (j["id"], time.time() - t0, t.get("consumed_credits")))
            done[j["id"]] = tid
        log("batch complete")
    finally:
        LOCK.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
