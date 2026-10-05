import lightgbm as lgb


def new_model() -> lgb.LGBMClassifier:
    return lgb.LGBMClassifier(
        n_estimators=200, learning_rate=0.03, num_leaves=15, min_child_samples=50,
        subsample=0.8, subsample_freq=1, colsample_bytree=0.8, reg_lambda=5.0,
        random_state=42, verbose=-1,
    )


def fit(X, y):
    m = new_model()
    m.fit(X, y.astype(int))
    return m
