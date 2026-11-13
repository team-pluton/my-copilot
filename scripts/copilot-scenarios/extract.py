import io, re, json, sys
src = io.open(sys.argv[1], encoding="utf-8").read()
start = src.index("const SCENARIOS: Record<ScenarioId")
end = src.index("/** 충전 기록 → 재출발", start)
block = src[start:end]
order = re.search(r'const SCENARIO_ORDER: ScenarioId\[\] = \[([^\]]+)\]', src).group(1)
order = [x.strip().strip('"') for x in order.split(",")]
out = {}
for m in re.finditer(r'\n    ([A-Z]): \{ title: "([^"]+)", steps: \[(.*?)\n    \] \},', block, re.S):
    sid, title, body = m.group(1), m.group(2), m.group(3)
    steps = re.findall(r'\{ title: "([^"]+)", say: "((?:[^"\\]|\\.)*)"', body)
    out[sid] = {"title": title, "steps": steps}
json.dump({"order": order, "scenarios": out}, io.open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(out), sum(len(v["steps"]) for v in out.values()), order)
