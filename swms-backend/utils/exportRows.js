exports.toCsv = (columns, rows) => {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    let text = String(value);
    if (/^[=+@-]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    columns.map((column) => escape(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column.key])).join(",")),
  ].join("\r\n");
};
