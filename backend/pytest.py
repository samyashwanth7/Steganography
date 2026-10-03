import sys
import os
import inspect
import time

# 1. If real pytest is available in site-packages, delegate to it
real_pytest_found = False
cwd = os.path.abspath(os.path.dirname(__file__))
other_paths = [p for p in sys.path if os.path.abspath(p) != cwd]
for p in other_paths:
    candidate = os.path.join(p, 'pytest', '__init__.py')
    if os.path.exists(candidate):
        real_pytest_found = True
        break

if real_pytest_found:
    import runpy
    sys.path = other_paths
    runpy.run_module('pytest', run_name='__main__')
    sys.exit(0)

# 2. Fallback: lightweight test runner for offline / sandboxed execution
# Load conftest.py if present in tests directory
tests_dir = os.path.join(cwd, 'tests')
if tests_dir not in sys.path:
    sys.path.insert(0, tests_dir)
if cwd not in sys.path:
    sys.path.insert(0, cwd)
conftest_path = os.path.join(tests_dir, 'conftest.py')
conftest_fixtures = {}

if os.path.exists(conftest_path):
    import importlib.util
    spec = importlib.util.spec_from_file_location("conftest", conftest_path)
    conftest_mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(conftest_mod)
    for attr in dir(conftest_mod):
        val = getattr(conftest_mod, attr)
        if callable(val) and not inspect.isclass(val):
            conftest_fixtures[attr] = val

# Discover test_*.py in tests/
test_files = [f for f in os.listdir(tests_dir) if f.startswith('test_') and f.endswith('.py')]
test_files.sort()

passed = 0
failed = 0
errors = []

for tf in test_files:
    tf_path = os.path.join(tests_dir, tf)
    mod_name = tf[:-3]
    import importlib.util
    spec = importlib.util.spec_from_file_location(mod_name, tf_path)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as e:
        print(f"ERROR importing {tf}: {e}")
        failed += 1
        errors.append((tf, str(e)))
        continue

    for attr in dir(mod):
        if attr.startswith('test_') and callable(getattr(mod, attr)):
            fn = getattr(mod, attr)
            # Inspect parameters to inject fixtures from conftest
            sig = inspect.signature(fn)
            kwargs = {}
            for param in sig.parameters.values():
                if param.name in conftest_fixtures:
                    fixture_fn = conftest_fixtures[param.name]
                    # Check if fixture is a generator
                    if inspect.isgeneratorfunction(fixture_fn):
                        gen = fixture_fn()
                        kwargs[param.name] = next(gen)
                    else:
                        kwargs[param.name] = fixture_fn()
                elif hasattr(mod, param.name):
                    kwargs[param.name] = getattr(mod, param.name)

            t0 = time.time()
            try:
                fn(**kwargs)
                passed += 1
                sys.stdout.write(".")
                sys.stdout.flush()
            except Exception as e:
                failed += 1
                sys.stdout.write("F")
                sys.stdout.flush()
                import traceback
                errors.append((f"{tf}::{attr}", traceback.format_exc()))

print()
if errors:
    print("\nFAILURES:")
    for name, tb in errors:
        print(f"=== {name} ===")
        print(tb)

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed > 0 else 0)
