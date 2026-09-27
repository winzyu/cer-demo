"""Exercise the label-generator CLI offline, including fail-before-write behavior."""
import copy
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'eval/fixtures-wave1/refusal-buffering-capacity-not-measured.json'


def run_case(mutate=None, stale=False):
    with tempfile.TemporaryDirectory(prefix='wave1-label-check-') as temp:
        base = Path(temp)
        fixtures = base / 'fixtures'
        output = base / 'labels'
        fixtures.mkdir()
        output.mkdir()
        fixture = json.loads(SOURCE.read_text())
        # First fixture must also remain untouched when validation of a later one fails.
        for name in ['a-valid', 'b-check']:
            item = copy.deepcopy(fixture)
            item['id'] = name
            if name == 'b-check' and mutate:
                mutate(item)
            (fixtures / f'{name}.json').write_text(json.dumps(item))
            (output / f'{name}.json').write_text('sentinel\n')
        if stale:
            (output / 'obsolete.json').write_text('sentinel\n')
        before = {p.name: p.read_bytes() for p in output.iterdir()}
        result = subprocess.run([
            str(ROOT / 'node_modules/.bin/ts-node'), 'scripts/resolveRetrievalLabels.ts',
            f'--fixtures={fixtures}', f'--out={output}',
        ], cwd=ROOT, capture_output=True, text=True, check=False)
        if mutate or stale:
            assert result.returncode != 0, 'invalid evidence unexpectedly succeeded'
            assert before == {p.name: p.read_bytes() for p in output.iterdir()}, 'partial output written'
            return
        assert result.returncode == 0, result.stderr
        label = json.loads((output / 'b-check.json').read_text())
        assert label['turns'][0]['relevant'] != label['turns'][1]['relevant']
        for turn in label['turns']:
            assert turn['relevant'] and 'noRelevantChunks' not in turn
            assert all(chunk['grade'] == 1 for chunk in turn['relevant'])


run_case()
run_case(lambda f: f['turns'][1].pop('retrieval_evidence'))
run_case(lambda f: f['turns'][1].update(retrieval_evidence=[]))
run_case(lambda f: f['turns'][1]['retrieval_evidence'][0].update(quote='not in this corpus'))
run_case(lambda f: f['turns'][1]['retrieval_evidence'][0].update(filename='absent.pdf'))
run_case(stale=True)
print('PASS: distinct per-turn refusal context; five failures preserve every output byte')
