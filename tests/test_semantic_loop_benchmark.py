"""Fixture benchmark metric invariants."""
import unittest

from semantic_loop_benchmark import run_benchmark


class BenchmarkTests(unittest.TestCase):
    def test_metrics(self):
        m=run_benchmark(); self.assertEqual(m["cases"],8)
        self.assertEqual(m["true_positive"]+m["false_negative"],5)
        self.assertEqual(m["true_negative"]+m["false_positive"],3)
        for k in ("precision","recall","false_positive_rate"):
            self.assertGreaterEqual(m[k],0); self.assertLessEqual(m[k],1)
if __name__=="__main__": unittest.main()
