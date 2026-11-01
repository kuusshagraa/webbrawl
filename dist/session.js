// In-memory state that should not be persisted: receipt photos, pending
// scans and the snapshot of a saved bill being edited (for Discard).
export const session = {
  photos: new Map(), // billId -> object URL of the processed receipt image
  queue: [], // further receipt files picked together, scanned one by one
  edit: null, // { id, json } while a saved bill is being edited
  badFields: new Set(), // fields to highlight after a failed Continue
  openDetails: new Set(), // person ids whose "Bill Details" are expanded
  justSaved: null, // bill id to play the receipt "print" animation for
};
