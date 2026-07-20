import { formatDisplayDate } from '../utils/dateFormat';

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0
}).format(Number(value) || 0);

const normalizeComparableText = (value) =>
  String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

const parseBookingDate = (value) => {
  if (!value) return new Date();
  return value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
};

const formatTime = (date) =>
  `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

export const generateDetalleFacturaPdf = async ({ companyContext, clientName, clientEmail, items, discountDetails = [], totals, payments }) => {
  if (!items?.length) return alert('Seleccioná al menos un turno para facturar.');

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const companyName = companyContext?.company_name || companyContext?.name || 'QuieroTurnoApp';
  const invoiceDate = formatDisplayDate(new Date());
  const invoiceNumber = String(Date.now()).slice(-8);
  const safeClientName = clientName || 'Cliente sin datos';
  const safeClientEmail = clientEmail || 'Sin mail cargado';
  const margin = 14;
  let currentY = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('FACTURA', margin, currentY);
  doc.setFontSize(15);
  doc.text(companyName, 105, currentY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('CUIT: 23-223454345-9', 196, currentY - 5, { align: 'right' });
  doc.text('Telefono: 11324534353', 196, currentY, { align: 'right' });
  doc.text('Domicilio: Blas Parera 1798, Quilmes', 196, currentY + 5, { align: 'right' });

  currentY += 14;
  doc.setDrawColor(56, 95, 140);
  doc.line(margin, currentY, 196, currentY);
  currentY += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', margin, currentY);
  doc.text('Fecha de cobro', 112, currentY);
  doc.text('Factura nro.', 160, currentY);
  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(safeClientName, margin, currentY);
  doc.text(safeClientEmail, margin, currentY + 5);
  doc.text(invoiceDate, 112, currentY);
  doc.text(invoiceNumber, 160, currentY);

  currentY += 16;
  doc.setDrawColor(120, 150, 185);
  doc.rect(margin, currentY, 182, 9);
  doc.setFont('helvetica', 'bold');
  doc.text('ITEM', margin + 3, currentY + 6);
  doc.text('DESCRIPCION', margin + 56, currentY + 6);
  doc.text('EMPLEADO', margin + 118, currentY + 6);
  doc.text('IMPORTE', 192, currentY + 6, { align: 'right' });
  currentY += 9;
  doc.setFont('helvetica', 'normal');

  items.forEach((item, index) => {
    const serviceDate = formatDisplayDate(item.startAt);
    const startDate = parseBookingDate(item.startAt);
    const endDate = parseBookingDate(item.endAt);
    const timeRange = `${formatTime(startDate)} - ${formatTime(endDate)}`;
    doc.rect(margin, currentY, 182, 12);
    doc.text(String(index + 1), margin + 3, currentY + 7);
    doc.text(doc.splitTextToSize(`${item.serviceName} (${serviceDate} ${timeRange})`, 58), margin + 56, currentY + 5);
    doc.text(doc.splitTextToSize(item.employeeName || 'Sin empleado', 38), margin + 118, currentY + 5);
    doc.text(formatMoney(item.basePrice), 192, currentY + 7, { align: 'right' });
    currentY += 12;
  });

  currentY += 8;
  const totalsX = 196;
  const labelX = 136;
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', labelX, currentY);
  doc.text(formatMoney(totals.grossTotal), totalsX, currentY, { align: 'right' });
  currentY += 6;
  discountDetails.filter((item) => item.amount > 0).forEach((discountDetail) => {
    doc.text(doc.splitTextToSize(discountDetail.label, 42), labelX, currentY);
    doc.text(`-${formatMoney(discountDetail.amount)}`, totalsX, currentY, { align: 'right' });
    currentY += 6;
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Descuento total', labelX, currentY);
  doc.text(`-${formatMoney(totals.discountTotal)}`, totalsX, currentY, { align: 'right' });
  currentY += 7;
  doc.setFillColor(239, 246, 255);
  doc.rect(labelX - 4, currentY - 5, 64, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', labelX, currentY + 1);
  doc.text(formatMoney(totals.finalTotal), totalsX, currentY + 1, { align: 'right' });

  if (payments) {
    currentY += 20;
    doc.setFont('helvetica', 'normal');
    doc.text(`Pagos: Efectivo ${formatMoney(payments.cash)} · Transferencia ${formatMoney(payments.transfer)} · Tarjeta ${formatMoney(payments.card)}`, margin, currentY);
  }

  doc.save(`factura-${normalizeComparableText(safeClientName).replace(/[^a-z0-9]+/g, '-') || 'cliente'}-${invoiceNumber}.pdf`);
};
