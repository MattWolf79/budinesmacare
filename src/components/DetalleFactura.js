import { formatDisplayDate } from '../utils/dateFormat';

const formatMoney = (value) => new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
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

const TAX_CONDITION_LABELS = {
  consumidor_final: 'Consumidor final',
  responsable_inscripto: 'Responsable inscripto',
  monotributo: 'Monotributo',
  exento: 'Exento',
  no_responsable: 'No responsable'
};

const formatFiscalId = (value) => {
  const cleanValue = String(value || '').replace(/\D/g, '');
  return cleanValue || 'No informado';
};

export const generateDetalleFacturaPdf = async ({ companyContext, clientName, clientEmail, items, discountDetails = [], surchargeDetails = [], totals, fiscalInfo = null, fiscalQrPayload = null, payments, paymentCoverage = [], invoiceDate: providedInvoiceDate, invoiceNumber: providedInvoiceNumber }) => {
  if (!items?.length) return alert('Seleccioná al menos un turno para facturar.');

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const companyName = companyContext?.company_name || companyContext?.name || 'QuieroTurnoApp';
  const receiptType = fiscalInfo?.receiptType || 'B';
  const receiptLabel = fiscalInfo?.receiptLabel || `Factura ${receiptType}`;
  const invoiceDate = providedInvoiceDate ? formatDisplayDate(providedInvoiceDate) : formatDisplayDate(new Date());
  const invoiceNumber = providedInvoiceNumber || String(Date.now()).slice(-8);
  const safeClientName = clientName || 'Cliente sin datos';
  const safeClientEmail = clientEmail || 'Sin mail cargado';
  const customerBusinessName = fiscalInfo?.customerBusinessName || safeClientName;
  const customerConditionLabel = TAX_CONDITION_LABELS[fiscalInfo?.customerTaxCondition] || 'Consumidor final';
  const businessConditionLabel = TAX_CONDITION_LABELS[fiscalInfo?.businessTaxCondition] || 'No informado';
  const businessCuit = formatFiscalId(fiscalInfo?.businessCuit);
  const customerFiscalId = formatFiscalId(fiscalInfo?.customerFiscalId);
  const margin = 14;
  let currentY = 18;
  const companyNameLines = doc.splitTextToSize(companyName, 74);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(receiptLabel.toUpperCase(), margin, currentY);
  doc.setDrawColor(56, 95, 140);
  doc.rect(96, currentY - 10, 18, 14);
  doc.setFontSize(14);
  doc.text(receiptType, 105, currentY - 1, { align: 'center' });
  doc.setFontSize(13);
  doc.text(companyNameLines, 105, currentY + 16, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`CUIT: ${businessCuit}`, 196, currentY - 5, { align: 'right' });
  doc.text(`Condicion: ${businessConditionLabel}`, 196, currentY, { align: 'right' });
  doc.text('Telefono: 11324534353', 196, currentY + 5, { align: 'right' });
  doc.text(`Domicilio: ${fiscalInfo?.businessFiscalAddress || 'Blas Parera 1798, Quilmes'}`, 196, currentY + 10, { align: 'right' });

  currentY += Math.max(26, 16 + (companyNameLines.length * 5));
  doc.setDrawColor(56, 95, 140);
  doc.line(margin, currentY, 196, currentY);
  currentY += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', margin, currentY);
  doc.text('Fecha de cobro', 112, currentY);
  doc.text('Factura nro.', 160, currentY);
  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(customerBusinessName, 84), margin, currentY);
  doc.text(safeClientEmail, margin, currentY + 5);
  doc.text(`CUIT/DNI: ${customerFiscalId}`, margin, currentY + 10);
  doc.text(`Condicion: ${customerConditionLabel}`, margin, currentY + 15);
  if (fiscalInfo?.customerFiscalAddress) doc.text(doc.splitTextToSize(`Domicilio: ${fiscalInfo.customerFiscalAddress}`, 84), margin, currentY + 20);
  doc.text(invoiceDate, 112, currentY);
  doc.text(invoiceNumber, 160, currentY);

  currentY += fiscalInfo?.customerFiscalAddress ? 30 : 24;
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
  const labelX = 92;
  const detailLabelX = 92;
  const totalsBandX = 86;
  const totalsBandWidth = 110;
  doc.setFont('helvetica', 'normal');
  doc.text('Valor servicios', labelX, currentY);
  doc.text(formatMoney(totals.grossTotal), totalsX, currentY, { align: 'right' });
  currentY += 6;
  discountDetails.filter((item) => item.amount > 0).forEach((discountDetail) => {
    doc.text(doc.splitTextToSize(discountDetail.label, 80), labelX, currentY);
    doc.text(`-${formatMoney(discountDetail.amount)}`, totalsX, currentY, { align: 'right' });
    currentY += 6;
  });
  surchargeDetails.filter((item) => item.amount > 0).forEach((surchargeDetail) => {
    doc.text(surchargeDetail.label, detailLabelX, currentY);
    doc.text(`+${formatMoney(surchargeDetail.amount)}`, totalsX, currentY, { align: 'right' });
    currentY += 6;
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Descuento total', labelX, currentY);
  doc.text(`-${formatMoney(totals.discountTotal)}`, totalsX, currentY, { align: 'right' });
  currentY += 7;
  if (Number(totals.surchargeTotal || 0) > 0) {
    doc.text('Recargo total', labelX, currentY);
    doc.text(`+${formatMoney(totals.surchargeTotal)}`, totalsX, currentY, { align: 'right' });
    currentY += 7;
  }
  if (totals.discriminatesVat) {
    doc.text('Neto gravado', labelX, currentY);
    doc.text(formatMoney(totals.taxableNet), totalsX, currentY, { align: 'right' });
    currentY += 7;
    doc.text(`IVA ${Number(totals.vatRate || 0)}%`, labelX, currentY);
    doc.text(formatMoney(totals.vatAmount), totalsX, currentY, { align: 'right' });
    currentY += 7;
  }
  doc.setFillColor(239, 246, 255);
  doc.rect(totalsBandX, currentY - 5, totalsBandWidth, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL A COBRAR', labelX, currentY + 1);
  doc.text(formatMoney(totals.finalTotal), totalsX, currentY + 1, { align: 'right' });

  if (payments) {
    currentY += 16;
    doc.setFont('helvetica', 'normal');
    const paymentRows = Array.isArray(paymentCoverage) && paymentCoverage.length
      ? paymentCoverage.filter((row) => Number(row.chargedAmount || 0) > 0).map((row) => ({ label: row.label, amount: row.chargedAmount }))
      : [
        { label: 'Efectivo', amount: payments.cash },
        { label: 'Transferencia', amount: payments.transfer },
        { label: 'Tarjeta', amount: payments.card }
      ];

    paymentRows.forEach((row) => {
      doc.text(`Pagado ${String(row.label || '').toLowerCase()}`, labelX, currentY);
      doc.text(formatMoney(row.amount), totalsX, currentY, { align: 'right' });
      currentY += 6;
    });
    currentY += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Cobrado total', labelX, currentY);
    doc.text(formatMoney(paymentRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)), totalsX, currentY, { align: 'right' });
  }

  if (fiscalQrPayload?.prepared) {
    currentY += 14;
    if (currentY > 252) {
      doc.addPage();
      currentY = 18;
    }
    doc.setDrawColor(120, 150, 185);
    doc.rect(margin, currentY, 34, 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('QR fiscal', margin + 17, currentY + 15, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Pendiente', margin + 17, currentY + 21, { align: 'center' });
    doc.setFontSize(8);
    doc.text('Payload fiscal preparado para conectar un generador QR o servicio fiscal cuando se defina proveedor.', margin + 42, currentY + 8);
    doc.text(doc.splitTextToSize(`Tipo: ${fiscalQrPayload.receiptType} · Total: ${formatMoney(fiscalQrPayload.totals?.total)} · IVA: ${formatMoney(fiscalQrPayload.totals?.vat)}`, 132), margin + 42, currentY + 16);
  }

  doc.save(`factura-${normalizeComparableText(safeClientName).replace(/[^a-z0-9]+/g, '-') || 'cliente'}-${invoiceNumber}.pdf`);
};
