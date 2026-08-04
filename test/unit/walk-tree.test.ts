import * as assert from 'assert';
import { walkTree } from '../../src/utils/async';

interface TreeNode {
  name: string;
  children: TreeNode[];
}

function buildTree(depth: number, breadth: number): TreeNode {
  const node: TreeNode = { name: 'root', children: [] };
  let level: TreeNode[] = [node];
  for (let d = 1; d < depth; d += 1) {
    const next: TreeNode[] = [];
    for (const parent of level) {
      for (let i = 0; i < breadth; i += 1) {
        const child: TreeNode = { name: `${parent.name}/${d}-${i}`, children: [] };
        parent.children.push(child);
        next.push(child);
      }
    }
    level = next;
  }
  return node;
}

function expandFrom(byPath: Map<string, string[]>): (path: string) => Promise<string[]> {
  return async (path: string) => {
    await new Promise((resolve) => setImmediate(resolve));
    return byPath.get(path) ?? [];
  };
}

describe('walkTree', () => {
  it('visits every node with a global concurrency pool', async () => {
    const tree = buildTree(4, 3); // 1 + 3 + 9 + 27 = 40 nodes
    const byPath = new Map<string, string[]>();
    const expected: string[] = [];
    const collect = (node: TreeNode): void => {
      const children = node.children.map((child) => child.name);
      byPath.set(node.name, children);
      expected.push(node.name);
      for (const child of node.children) {
        collect(child);
      }
    };
    collect(tree);

    const visited: string[] = [];
    const outcome = await walkTree(
      tree.name,
      async (path) => {
        visited.push(path);
        return byPath.get(path) ?? [];
      },
      { concurrency: 8, maxItems: 0 },
    );

    assert.strictEqual(outcome.visited, expected.length);
    assert.strictEqual(outcome.truncated, false);
    assert.strictEqual(outcome.cancelled, false);
    assert.deepStrictEqual([...visited].sort(), expected.sort());
  });

  it('marks truncated when the budget is exceeded', async () => {
    const tree = buildTree(3, 2); // 1 + 2 + 4 = 7 nodes
    const byPath = new Map<string, string[]>();
    const collect = (node: TreeNode): void => {
      byPath.set(
        node.name,
        node.children.map((child) => child.name),
      );
      for (const child of node.children) {
        collect(child);
      }
    };
    collect(tree);

    const outcome = await walkTree(tree.name, expandFrom(byPath), { concurrency: 4, maxItems: 3 });

    assert.strictEqual(outcome.visited, 3);
    assert.strictEqual(outcome.truncated, true);
  });

  it('supports cancellation', async () => {
    const tree = buildTree(3, 2);
    const byPath = new Map<string, string[]>();
    const collect = (node: TreeNode): void => {
      byPath.set(
        node.name,
        node.children.map((child) => child.name),
      );
      for (const child of node.children) {
        collect(child);
      }
    };
    collect(tree);
    let shouldCancel = false;

    const outcome = await walkTree(tree.name, expandFrom(byPath), {
      concurrency: 2,
      maxItems: 0,
      isCancelled: () => shouldCancel,
    });
    assert.strictEqual(outcome.cancelled, false, 'no cancellation requested');

    shouldCancel = true;
    const cancelledOutcome = await walkTree(tree.name, expandFrom(byPath), {
      concurrency: 2,
      maxItems: 0,
      isCancelled: () => shouldCancel,
    });
    assert.strictEqual(cancelledOutcome.cancelled, true);
  });

  it('visits the same set regardless of concurrency', async () => {
    const tree = buildTree(4, 2);
    const byPath = new Map<string, string[]>();
    const collect = (node: TreeNode): void => {
      byPath.set(
        node.name,
        node.children.map((child) => child.name),
      );
      for (const child of node.children) {
        collect(child);
      }
    };
    collect(tree);

    const run = async (concurrency: number): Promise<string[]> => {
      const visited: string[] = [];
      await walkTree(
        tree.name,
        async (path) => {
          visited.push(path);
          return byPath.get(path) ?? [];
        },
        { concurrency, maxItems: 0 },
      );
      return [...visited].sort();
    };

    const serial = await run(1);
    const parallel = await run(16);
    assert.deepStrictEqual(parallel, serial, 'concurrency must not change the visited set');
  });
});
