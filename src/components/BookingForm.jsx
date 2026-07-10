import { useState } from 'react';
import { Card, CardContent, Typography, Button } from '@mui/material';
import { DatePicker, TimePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import 'dayjs/locale/es';
import { supabase } from '../api/supabaseClient';

export default function BookingForm({ user, refresh }) {

  const [date, setDate] = useState(dayjs());
  const [time, setTime] = useState(dayjs());

  const createBooking = async () => {
    const finalDate = date
      .hour(time.hour())
      .minute(time.minute())
      .toISOString();

    await supabase.from('appointments').insert({
      date: finalDate,
      status: 'reserved',
      user_id: user.id
    });

    alert('Turno reservado ✅');
    refresh();
  };

  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Typography variant="h6">
          Reservar turno
        </Typography>

        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
          
          <DatePicker
            label="Seleccionar fecha"
            value={date}
            onChange={(newValue) => setDate(newValue)}
            format="DD/MM/YYYY"
            sx={{ mt: 2 }}
          />

          <TimePicker
            label="Seleccionar horario"
            value={time}
            onChange={(newValue) => setTime(newValue)}
            ampm={false}
            sx={{ mt: 2 }}
          />

        </LocalizationProvider>

        <Button
          variant="contained"
          fullWidth
          sx={{ mt: 3 }}
          onClick={createBooking}
        >
          Confirmar turno
        </Button>
      </CardContent>
    </Card>
  );
}