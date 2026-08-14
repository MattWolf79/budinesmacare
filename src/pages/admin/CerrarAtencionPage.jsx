import AgendaGrid from '../../components/AgendaGrid';

export default function CerrarAtencionPage(props) {
  return (
    <AgendaGrid
      {...props}
      closeAttentionPage
    />
  );
}