"""8-connected A* over a cost grid (inf = blocked). Array based + corridor crop so big grids stay fast."""
import heapq
import math
import numpy as np

_N = [(-1, 0, 1.0), (1, 0, 1.0), (0, -1, 1.0), (0, 1, 1.0),
      (-1, -1, math.sqrt(2)), (-1, 1, math.sqrt(2)), (1, -1, math.sqrt(2)), (1, 1, math.sqrt(2))]


def _search(cost, start, goal):
    h, w = cost.shape
    if not (np.isfinite(cost[start]) and np.isfinite(cost[goal])):
        return None
    flat = cost.ravel().tolist()
    INF = float("inf")
    g = [INF] * (h * w)
    came = {}
    s, t = start[0] * w + start[1], goal[0] * w + goal[1]
    gr, gc = goal
    g[s] = 0.0
    heap = [(math.hypot(gr - start[0], gc - start[1]), 0.0, s)]
    closed = bytearray(h * w)
    while heap:
        _, gs, cur = heapq.heappop(heap)
        if closed[cur]:
            continue
        if cur == t:
            path = [(cur // w, cur % w)]
            while cur in came:
                cur = came[cur]
                path.append((cur // w, cur % w))
            return path[::-1]
        closed[cur] = 1
        r, c = divmod(cur, w)
        cc = flat[cur]
        for dr, dc, step in _N:
            nr, nc = r + dr, c + dc
            if nr < 0 or nc < 0 or nr >= h or nc >= w:
                continue
            ni = nr * w + nc
            m = flat[ni]
            if m == INF or closed[ni]:
                continue
            if dr and dc and (flat[(r + dr) * w + c] == INF or flat[r * w + c + dc] == INF):
                continue
            ng = gs + step * 0.5 * (cc + m)
            if ng < g[ni]:
                g[ni] = ng
                came[ni] = cur
                heapq.heappush(heap, (ng + math.hypot(gr - nr, gc - nc), ng, ni))
    return None


def astar(cost: np.ndarray, start: tuple[int, int], goal: tuple[int, int]):
    """Returns list of (row, col) or None. Searches a corridor first (fast), then the whole grid if that fails."""
    h, w = cost.shape
    if (h * w) > 250_000:
        d = math.hypot(goal[0] - start[0], goal[1] - start[1])
        for k in (0.35, 1.0):
            m = int(d * k + 40)
            r0, r1 = max(0, min(start[0], goal[0]) - m), min(h, max(start[0], goal[0]) + m + 1)
            c0, c1 = max(0, min(start[1], goal[1]) - m), min(w, max(start[1], goal[1]) + m + 1)
            sub = cost[r0:r1, c0:c1]
            p = _search(sub, (start[0] - r0, start[1] - c0), (goal[0] - r0, goal[1] - c0))
            if p:
                return [(r + r0, c + c0) for r, c in p]
            if (r1 - r0) == h and (c1 - c0) == w:
                return None
    return _search(cost, start, goal)
