"""Small statistics helpers so results come with their uncertainty, not as bare numbers."""
import numpy as np
from sklearn.metrics import roc_auc_score


def block_bootstrap_auc(y, p, block: int, n_boot: int = 1000, seed: int = 0) -> dict:
    """AUC with a 95% interval and a one-sided p-value for 'AUC > 0.5'.

    Resamples blocks of consecutive rows (not single rows) because neighbouring rows share the same future price
    move; resampling single rows would make the result look more certain than it is.
    """
    y, p = np.asarray(y), np.asarray(p)
    n = len(y)
    if n < 30 or len(np.unique(y)) < 2:
        return {"auc": None, "lo": None, "hi": None, "p_value": None, "n": int(n)}
    auc = float(roc_auc_score(y, p))
    block = max(1, min(block, n))
    rng = np.random.default_rng(seed)
    n_blocks = int(np.ceil(n / block))
    boots = []
    for _ in range(n_boot):
        starts = rng.integers(0, n - block + 1, size=n_blocks)
        idx = (starts[:, None] + np.arange(block)[None, :]).ravel()[:n]
        yb = y[idx]
        if len(np.unique(yb)) == 2:
            boots.append(roc_auc_score(yb, p[idx]))
    boots = np.asarray(boots)
    return {
        "auc": auc, "lo": float(np.quantile(boots, 0.025)), "hi": float(np.quantile(boots, 0.975)),
        "p_value": float((boots <= 0.5).mean()), "n": int(n),
    }


def wilson(successes: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% interval for a share (for example the share of calls that were right)."""
    if n == 0:
        return (0.0, 1.0)
    p = successes / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (float(centre - half), float(centre + half))
