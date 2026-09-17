import { useApp } from '../context/AppContext';
import { formatDate } from '../utils/formatters';

export default function NotificationsPage() {
  const { state } = useApp();
  return (
    <div className="notification-stack">
      {state.notifications.length === 0 ? (
        <section className="card empty-state">You have no notifications.</section>
      ) : null}
      {state.notifications.map((note) => (
        <section key={note.id} className="notification-card">
          <div>
            <strong>{note.title}</strong>
            <p>{note.message}</p>
          </div>
          <span>{formatDate(note.createdAt)}</span>
        </section>
      ))}
    </div>
  );
}
