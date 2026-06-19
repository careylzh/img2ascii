# img2ascii

Converts every `.png`, `.jpg`, and `.jpeg` image in this repo into ASCII art.
For each image, the tool writes a matching `.txt` file next to the source image
and prints the ASCII output in the terminal.

## Requirements

- Python 3
- Pillow

`run.sh` creates a project-local `.venv` and installs Pillow there if it is
missing. It does not install packages into the system Python environment.

## Usage

```sh
./run.sh
```

Use a custom output width:

```sh
./run.sh 160
```

Show CLI help:

```sh
./run.sh --help
```

The width is measured in terminal characters. Larger widths preserve more image
detail but create wider `.txt` files and terminal output.

## Modes

### Default mode

```sh
./run.sh
```

Runs with the default width of `120` characters. This is a good starting point
for most images and terminal windows.

### Wide/detail mode

```sh
./run.sh 160
```

Uses a wider ASCII output for more detail. Try this for high-resolution images
or when viewing the result in a wide terminal.

### Compact mode

```sh
./run.sh 80
```

Uses a narrower ASCII output that is easier to read in smaller terminal windows.
This is useful for quick previews or lower-detail output.

### Batch mode

The tool always scans the full repo and converts every supported image it finds.
Supported image types are:

- `.png`
- `.jpg`
- `.jpeg`

Generated `.txt` files are saved next to their source images.

### Preview mode

After saving each `.txt` file, the tool also prints the result in the terminal.
When multiple images are found, it pauses briefly between previews.
