import type { PropsWithChildren } from 'react';

type ModalProps = PropsWithChildren<{
  title: string;
  isOpen: boolean;
}>;

export function Modal({ title, isOpen, children }: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation">
      <section className="modal" aria-modal="true" role="dialog" aria-label={title}>
        <h2 className="modal-title">{title}</h2>
        <div>{children}</div>
      </section>
    </div>
  );
}
