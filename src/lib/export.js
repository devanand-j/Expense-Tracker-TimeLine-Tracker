import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient';

function normalizePdfText(value) {
  if (value == null) return '';
  // jsPDF built-in fonts do not reliably render the Rupee symbol.
  return String(value).replace(/₹/g, 'INR ');
}

export async function exportReportAsPdfAndUpload({
  title,
  rows,
  fileName,
  userId
}) {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const maxWidth = doc.internal.pageSize.getWidth() - marginX * 2;
  const lineHeight = 6;

  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(normalizePdfText(title), marginX, y);

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  rows.forEach((line) => {
    const normalized = normalizePdfText(line);
    const wrapped = doc.splitTextToSize(normalized, maxWidth);

    if (y + wrapped.length * lineHeight > pageHeight - 12) {
      doc.addPage();
      y = 18;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    doc.text(wrapped, marginX, y);
    y += Math.max(wrapped.length, 1) * lineHeight;
  });

  const pdfBlob = doc.output('blob');
  const path = `${userId}/${Date.now()}-${fileName}.pdf`;
  const { error } = await supabase.storage
    .from('exports')
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('exports').getPublicUrl(path);
  return data.publicUrl;
}

export async function exportReportAsXlsxAndUpload({
  sheetName,
  jsonData,
  fileName,
  userId
}) {
  const worksheet = XLSX.utils.json_to_sheet(jsonData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const xlsxArray = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([xlsxArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const path = `${userId}/${Date.now()}-${fileName}.xlsx`;
  const { error } = await supabase.storage.from('exports').upload(path, blob, {
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: false
  });

  if (error) throw error;
  const { data } = supabase.storage.from('exports').getPublicUrl(path);
  return data.publicUrl;
}
