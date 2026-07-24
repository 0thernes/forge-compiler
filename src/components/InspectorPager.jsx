function clampPage(page, pageCount) {
  return Math.min(Math.max(Math.trunc(page), 0), pageCount - 1);
}

export function InspectorPager({
  count,
  page,
  pageSize,
  onPageChange,
  noun = "items",
}) {
  if (count <= pageSize) return null;

  const pageCount = Math.ceil(count / pageSize);
  const currentPage = clampPage(page, pageCount);
  const firstItem = currentPage * pageSize + 1;
  const lastItem = Math.min(firstItem + pageSize - 1, count);

  const changePage = (targetPage) => {
    onPageChange(clampPage(targetPage, pageCount));
  };

  return (
    <nav className="inspector-pager" aria-label={`${noun} pagination`}>
      <button
        aria-label="Previous page"
        disabled={currentPage === 0}
        onClick={() => changePage(currentPage - 1)}
        type="button"
      >
        Previous
      </button>
      <span className="inspector-pager__status" aria-live="polite">
        {firstItem}–{lastItem} of {count} {noun} · Page {currentPage + 1} of{" "}
        {pageCount}
      </span>
      <button
        aria-label="Next page"
        disabled={currentPage === pageCount - 1}
        onClick={() => changePage(currentPage + 1)}
        type="button"
      >
        Next
      </button>
    </nav>
  );
}
