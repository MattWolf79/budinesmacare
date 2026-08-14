import AgendaGrid from '../../components/AgendaGrid';

export default function PendientesPage(props) {
  return (
    <AgendaGrid
      {...props}
      pendingView
    />
  );
}