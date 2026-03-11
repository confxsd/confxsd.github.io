// Reusable sortable table utility
// Usage:
//   const sorter = createSortableTable({ columns, data, onSort });
//   sorter.renderHead()  → returns <tr> innerHTML for <thead>
//   sorter.sort(key)     → sort by column key
//   sorter.getSorted()   → returns sorted data array

export function createSortableTable({ columns, defaultSort = null, defaultDir = 'asc' }) {
  let sortKey = defaultSort;
  let sortDir = defaultDir;
  let data = [];

  function setData(newData) {
    data = [...newData];
    if (sortKey) applySortInPlace();
  }

  function applySortInPlace() {
    const col = columns.find(c => c.key === sortKey);
    if (!col) return;

    const getValue = col.sortValue || (row => row[col.key]);

    data.sort((a, b) => {
      let va = getValue(a);
      let vb = getValue(b);

      // nulls/undefined always last
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;

      // string compare
      if (typeof va === 'string' && typeof vb === 'string') {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
      }

      let cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }

  function sort(key) {
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    applySortInPlace();
  }

  function renderHead(onClickPrefix) {
    return columns.map(col => {
      if (!col.sortable) {
        return `<th>${col.label || ''}</th>`;
      }
      const active = sortKey === col.key;
      const arrow = active ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';
      return `<th class="sortable-th${active ? ' sorted' : ''}" onclick="${onClickPrefix}('${col.key}')">${col.label || ''}${arrow}</th>`;
    }).join('');
  }

  function getSorted() {
    return data;
  }

  function getState() {
    return { sortKey, sortDir };
  }

  return { setData, sort, renderHead, getSorted, getState };
}
