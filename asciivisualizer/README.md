# ASCII Visualizer

A local web-based viewer for folders of `.txt` ASCII art files.

## Run

```sh
python -m asciivisualizer /path/to/ascii-folder
```

Then open the URL printed by the command, usually:

```text
http://127.0.0.1:8765
```

You can also start it without a folder and choose a folder in the browser UI:

```sh
python -m asciivisualizer
```

Use `Browse` to open the native folder picker, or paste an absolute folder path and press Enter.

Options:

```sh
python -m asciivisualizer /path/to/ascii-folder --host 127.0.0.1 --port 8765
```

The server only exposes `.txt` files inside the active folder when loading by path. The native folder picker reads selected `.txt` files directly in the browser. The UI supports folder path loading, native folder picking, file filtering, previous/next navigation, grid view, continuous single-page view, recursive folder scanning, font sizing, line-height controls, wrapping, inversion, and fit-to-width scaling.
