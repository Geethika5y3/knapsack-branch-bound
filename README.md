# Knapsack Branch-and-Bound Visualizer

## Objective
Show, step by step, how Branch-and-Bound solves the 0/1 Knapsack Problem: how the decision tree grows, how upper bounds are computed and how nodes are pruned.

## Features
- Input panel with validation and a default example
- Item table sorted by profit/weight ratio
- Live SVG decision tree (left = Include (1), right = Exclude (0)) with horizontal scrolling
- Next Step, Start, Pause, Resume, Reset and Use Example controls, plus a speed slider
- Bound calculation panel, priority queue table, live statistics
- Click any node for an explanation of its status
- Final result panel, explanation, pseudocode and complexity notes

## Technologies
HTML, CSS and plain JavaScript. No libraries, no build step.

## How to run
Open `index.html` in any modern browser.

## Algorithm
1. Sort items by profit/weight (descending).
2. Create the root node and compute its upper bound.
3. Repeatedly pop the live node with the highest bound (best-first search using a priority queue).
4. If its bound is <= the best profit found, prune it.
5. Otherwise branch: Include the next item (pruned if it exceeds capacity) and Exclude it. Update the best profit whenever an Include child improves it.
6. Stop when no live nodes remain.

## Branch-and-Bound concept
The upper bound is a fractional-knapsack estimate: current profit plus the best-ratio remaining items, taking a fraction of the first item that does not fit. It never underestimates the best reachable profit, so a node whose bound is <= the best known profit can be discarded safely.

## Complexity
- Time: O(2^n) worst case; usually much less because of pruning.
- Space: O(2^n) worst case for the live-node queue (the visualizer also stores the whole tree).

## Example
Input: weights 2, 3, 4, 5; profits 40, 50, 65, 70; capacity 8.

Output: Maximum profit 120, total weight 8, selected Item 2 and Item 4. The run generates 25 nodes, explores 13 and prunes 12 (20 steps).

## Future improvements
- Export the tree as an image
- Step backwards
- Compare with dynamic programming and brute force
- Compact tree mode for larger inputs
