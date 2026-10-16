'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { AdminCategory } from '../lib/api';

/**
 * PHASE 10: Recursive category tree component.
 *
 * Renders a nested list of categories with expand/collapse, search filtering,
 * and click-to-select. Each node shows the category name, product count, and
 * active/inactive badge. Hovering reveals action buttons (add child, toggle
 * active, delete).
 */

interface TreeNode extends AdminCategory {
  children: TreeNode[];
}

interface CategoryTreeProps {
  categories: AdminCategory[];
  selectedId: string | null;
  onSelect: (category: AdminCategory) => void;
  onAddChild: (parentId: string) => void;
  onToggleActive: (category: AdminCategory) => void;
  onDelete: (category: AdminCategory) => void;
  search: string;
}

/**
 * Build a tree structure from a flat list of categories.
 */
function buildTree(categories: AdminCategory[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const cat of categories) {
    byId.set(cat.id, { ...cat, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const cat of categories) {
    const node = byId.get(cat.id)!;
    if (cat.parentId && byId.has(cat.parentId)) {
      byId.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Sort children by sortOrder then name
  const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map(n => ({ ...n, children: sortNodes(n.children) }));
  return sortNodes(roots);
}

/**
 * Check whether a node or any of its descendants match the search term.
 */
function subtreeMatches(node: TreeNode, term: string): boolean {
  const lower = term.toLowerCase();
  if (node.name.toLowerCase().includes(lower)) return true;
  return node.children.some(child => subtreeMatches(child, lower));
}

function filterTree(roots: TreeNode[], term: string): TreeNode[] {
  if (!term) return roots;
  return roots
    .filter(node => subtreeMatches(node, term))
    .map(node => ({ ...node, children: filterTree(node.children, term) }));
}

export default function CategoryTree({
  categories,
  selectedId,
  onSelect,
  onAddChild,
  onToggleActive,
  onDelete,
  search,
}: CategoryTreeProps) {
  const tree = useMemo(() => buildTree(categories), [categories]);
  const filtered = useMemo(() => filterTree(tree, search), [tree, search]);

  if (filtered.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
        {search ? 'No categories match your search.' : 'No categories yet. Create one to get started.'}
      </div>
    );
  }

  return (
    <nav aria-label="Category tree" style={{ fontSize: 13 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {filtered.map(node => (
          <CategoryNode
            key={node.id}
            node={node}
            depth={0}
            selectedId={selectedId}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            search={search}
          />
        ))}
      </ul>
    </nav>
  );
}

function CategoryNode({
  node,
  depth,
  selectedId,
  onSelect,
  onAddChild,
  onToggleActive,
  onDelete,
  search,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (cat: AdminCategory) => void;
  onAddChild: (parentId: string) => void;
  onToggleActive: (cat: AdminCategory) => void;
  onDelete: (cat: AdminCategory) => void;
  search: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [hovered, setHovered] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedId;
  const rowRef = useRef<HTMLDivElement>(null);

  const handleToggle = useCallback(() => setExpanded(prev => !prev), []);

  return (
    <li>
      <div
        role="treeitem"
        ref={rowRef}
        aria-selected={isSelected}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={() => onSelect(node)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 8px',
          paddingLeft: 8 + depth * 20,
          cursor: 'pointer',
          background: isSelected ? '#e8f2f7' : hovered ? '#f3f6f8' : 'transparent',
          borderLeft: isSelected ? '3px solid #1a5c7a' : '3px solid transparent',
          borderRadius: '0 4px 4px 0',
          transition: 'background 0.12s',
        }}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); handleToggle(); }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          style={{
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', cursor: hasChildren ? 'pointer' : 'default',
            fontSize: 10, color: hasChildren ? '#4b5563' : 'transparent', padding: 0, flexShrink: 0,
          }}
          disabled={!hasChildren}
          tabIndex={-1}
        >
          {hasChildren ? (expanded ? '▼' : '▶') : '·'}
        </button>

        {/* Category name */}
        <span style={{
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: isSelected ? 600 : 400,
          color: node.isActive ? '#1f2937' : '#9ca3af',
          textDecoration: node.isActive ? 'none' : 'line-through',
        }}>
          {node.name}
        </span>

        {/* Product count */}
        {(node.productCount ?? 0) > 0 && (
          <span style={{
            fontSize: 10, color: '#6b7280', background: '#f3f4f6',
            padding: '1px 6px', borderRadius: 8, flexShrink: 0,
          }}>
            {node.productCount}
          </span>
        )}

        {/* Active badge */}
        {!node.isActive && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fef3c7',
            padding: '1px 5px', borderRadius: 4, flexShrink: 0,
          }}>
            OFF
          </span>
        )}

        {/* Hover actions */}
        <div style={{ display: 'flex', gap: 2, opacity: hovered ? 1 : 0, transition: 'opacity 0.12s' }}>
          <button
            type="button"
            title="Add child category"
            onClick={e => { e.stopPropagation(); onAddChild(node.id); }}
            style={{
              width: 20, height: 20, border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 12, color: '#1a5c7a', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
          <button
            type="button"
            title={node.isActive ? 'Disable category' : 'Enable category'}
            onClick={e => { e.stopPropagation(); onToggleActive(node); }}
            style={{
              width: 20, height: 20, border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 11, color: node.isActive ? '#b45309' : '#1b7a4b', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {node.isActive ? '⏸' : '▶'}
          </button>
          <button
            type="button"
            title="Delete category"
            onClick={e => { e.stopPropagation(); onDelete(node); }}
            style={{
              width: 20, height: 20, border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 11, color: '#b3372f', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {node.children.map(child => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              search={search}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
