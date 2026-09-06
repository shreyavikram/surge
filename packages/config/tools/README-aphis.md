# Refreshing the APHIS per-detection archive

The APHIS dashboard (Confirmations of HPAI in Commercial and Backyard Flocks) exposes bird counts only through its
download button: Download > Data > **Full data** > CSV. The export is UTF-16, tab-separated, with columns
`Confirmed Diagnosis, State, County Name, Special ID, Production, Control Area Released, Measure Names, Birds Affected`
(birds formatted like `1.2M`, rounded to 0.1M). Convert it with `python3 packages/config/tools/convert-aphis.py <export.csv>`,
which writes `data/snapshots/aphis-detections.csv`, then run `npm run snapshot -w @surge/server`.
