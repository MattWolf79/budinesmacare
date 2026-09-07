import {
  Box,
  Button,
  Container,
  Typography,
} from '@mui/material';

export default function InicioMacare() {
  return (
    <Container maxWidth="lg">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <Typography
          variant="h2"
          fontWeight="bold"
          gutterBottom
        >
          Macaré
        </Typography>

        <Typography
          variant="h5"
          sx={{ mb: 4 }}
        >
          Budines artesanales hechos con amor.
        </Typography>

        <Box
          sx={{
            display: 'flex',
            gap: 2,
            justifyContent: 'center',
          }}
        >
          <Button
            variant="contained"
            size="large"
          >
            Realizar Pedido
          </Button>

          <Button
            variant="outlined"
            size="large"
          >
            Ingresar
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
