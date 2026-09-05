import { useEffect, useRef } from 'react';
import type { FetcherWithComponents } from 'react-router';

export default function ConfirmDeleteDialog({
  fetcher,
  questionId,
  questionLabel,
}: {
  fetcher: FetcherWithComponents<{ ok: boolean; message: string }>;
  questionId: number;
  questionLabel: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      dialogRef.current?.close();
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <>
      <button
        className="btn btn-error btn-outline btn-sm"
        onClick={() => dialogRef.current?.showModal()}
        type="button"
      >
        Delete
      </button>
      <dialog className="modal" ref={dialogRef}>
        <div className="modal-box">
          <h3 className="text-lg font-bold">Delete Question?</h3>
          <p className="py-4 text-base-content/70">
            This will permanently remove{' '}
            <span className="font-medium">{questionLabel}</span> and all related
            votes.
          </p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost" type="submit">
                Cancel
              </button>
            </form>
            <fetcher.Form method="post">
              <input name="id" type="hidden" value={questionId} />
              <button
                className="btn btn-error"
                disabled={fetcher.state !== 'idle'}
                type="submit"
              >
                {fetcher.state === 'submitting'
                  ? 'Deleting...'
                  : 'Confirm Delete'}
              </button>
            </fetcher.Form>
          </div>
        </div>
        <form className="modal-backdrop" method="dialog">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
}
