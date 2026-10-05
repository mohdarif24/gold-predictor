"""Quick local check: feature groups and the no-look-ahead property. Run from the project root."""
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from core.features import FEATURE_SETS, build_features, feature_group, select_columns  # noqa: E402
from test_core import synthetic  # noqa: E402

df = synthetic(3000)
f = build_features(df, "M15")
print("columns:", f.shape[1], dict(Counter(feature_group(c) for c in f.columns)))
cut = build_features(df.iloc[:2000], "M15")
pd.testing.assert_frame_equal(f.iloc[:2000], cut, check_exact=False, atol=1e-9)
print("no look-ahead: OK")
print({k: len(select_columns(f.columns, k)) for k in FEATURE_SETS})
