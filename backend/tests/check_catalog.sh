#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT
compiler="${CXX:-g++}"
"$compiler" -std=c++17 -Wall -Wextra -Werror -pedantic backend/main.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o "$build_dir/catalog"
"$compiler" -std=c++17 -Wall -Wextra -Werror -pedantic backend/tests/catalog_test.cpp backend/catalog/parts_catalog.cpp backend/catalog/sample_catalog.cpp -o "$build_dir/catalog_test"
"$build_dir/catalog_test"
"$build_dir/catalog"
"$build_dir/catalog" --catalog-json > "$build_dir/catalog.json"
cmp backend/data/sample_parts.json "$build_dir/catalog.json"
python3 - "$build_dir/catalog.json" <<'PY'
import collections
import json
import sys
from pathlib import Path
catalog = json.loads(Path(sys.argv[1]).read_text())
assert catalog['schemaVersion'] == 1 and catalog['isSampleData'] is True
parts = catalog['parts']
expected = {'cpu', 'motherboard', 'graphics_card', 'ram', 'storage', 'power_supply', 'case'}
counts = collections.Counter(p['category'] for p in parts)
assert set(counts) == expected and all(counts[c] >= 3 for c in expected)
assert len({p['id'] for p in parts}) == len(parts)
fields = {'id', 'name', 'category', 'manufacturer', 'model', 'priceCents', 'currency', 'imageUrl', 'imageIsPlaceholder', 'availability', 'specs'}
assert all(set(p) == fields for p in parts)
print('JSON parsing, category counts, field consistency and seed/export parity passed.')
PY
if "$build_dir/catalog" --invalid > "$build_dir/output" 2> "$build_dir/error"; then
    echo 'Invalid CLI option was accepted' >&2
    exit 1
else
    status=$?
    test "$status" -eq 2
fi
