# Spartito

Write and render music notation on a **grand staff** (treble + bass) inside Obsidian — from fenced code blocks or in a dedicated visual editor.

Powered by the [VexFlow](https://github.com/vexflow/vexflow) engraving library. VexFlow and its music font are compiled into the plugin, so everything renders **fully offline with no external requests**.

<!-- Add a screenshot to docs/ and uncomment the line below:
![Spartito editor](docs/screenshot.png)
-->

## Features

- Grand staff rendering (treble + bass) with brace and bar lines.
- A visual editor: pick the hand, octave, accidental and duration, then click the notes or type them.
- Live preview that updates as you type.
- Notes, chords, rests, dotted values and accidentals.
- Automatic bar lines: measures are split from the time signature, and notes that cross a bar line are split and tied.
- Automatic beaming and key-signature accidentals.
- Save a score as a Markdown note and re-open it later in the editor.
- Configurable defaults (time signature, key, tempo, save folder).
- Self-contained: no network requests, no CDN — works on desktop and mobile.

## Usage

There are two ways to use the plugin.

### 1. Code blocks

Write a `spartito` (or `score`) fenced block. Each line is a `field: value` pair:

| Field    | Description                              | Default |
| -------- | ---------------------------------------- | ------- |
| `title`  | Title shown above the score              | —       |
| `tempo`  | Tempo in BPM, shown as `♩ = N`           | —       |
| `time`   | Time signature                           | `4/4`   |
| `key`    | Key signature                            | `C`     |
| `treble` | Right-hand notes (treble clef)           | —       |
| `bass`   | Left-hand notes (bass clef)              | —       |

**Note syntax**

- **Pitch** — letter `a`–`g`, an optional accidental, then the octave number: `c4`, `g5`, `a3`.
- **Accidentals** — `#` sharp, `##` double sharp, `b` flat, `bb` double flat, `n` natural: `c#4`, `eb3`, `fn4`.
- **Chords** — join notes with `+`: `c4+e4+g4`.
- **Duration** — append `:` and a code: `w` whole, `h` half, `q` quarter (default), `8` eighth, `16` sixteenth, `32` thirty-second: `c4:h`.
- **Dotted** — add a `.` after the duration: `c4:q.`.
- **Rests** — `r` (or `rest`), with an optional duration: `r:8`.
- **Bar lines** — `|` is optional; measures are split automatically.

Available time signatures: `4/4`, `3/4`, `2/4`, `2/2`, `6/8`, `3/8`, `9/8`, `12/8`, `6/4`.
Available keys: `C`, `G`, `D`, `A`, `E`, `B`, `F#`, `C#`, `F`, `Bb`, `Eb`, `Ab`, `Db`, `Gb`, `Cb`.

### 2. Editor

Open the editor from the **music** ribbon icon or the **Open score editor** command. Choose the hand, octave, accidental and duration, then click the note buttons (or type into the text fields). The score updates live. Use **Save as note** to store the score as a Markdown file containing a `spartito` block — every rendered score also shows an **Edit in editor** button to reopen it.

## Examples

A C major scale on both hands:

````markdown
```spartito
title: C Major Scale
tempo: 120
time: 4/4
key: C
treble: c4 d4 e4 f4 g4 a4 b4 c5
bass: c3 e3 g3 c3 e3 g3 e3 c3
```
````

A short waltz with chords, a dotted note and a rest (`score` and `spartito` are interchangeable):

````markdown
```score
title: Waltz Fragment
tempo: 90
time: 3/4
key: G
treble: g4:q b4:q d5:q | c5:q. b4:8 a4:q | g4:h.
bass: g2 d3+b3 d3+b3 | c3 g3 g3 | g2 d3+b3 r
```
````

## Settings

- **Default time signature** — time signature used for a new score.
- **Default key** — key signature used for a new score.
- **Default tempo (BPM)** — optional tempo prefilled for a new score.
- **Save folder** — vault folder where saved scores are created (empty = vault root).

## Development

The plugin is written in plain JavaScript and bundled with esbuild. VexFlow and the Bravura font are compiled into `main.js`, so the released plugin has no runtime dependencies and works fully offline.

```sh
npm install      # install dependencies
npm run dev      # build and watch src/main.js
npm run build    # production build (minified main.js)
```

Source lives in `src/main.js`; the build writes `main.js` in the plugin root.

## Credits and licenses

### Why a font is bundled

VexFlow draws music symbols (note heads, clefs, accidentals, rests, time signatures) using the **Bravura** SMuFL music font. VexFlow loads that font from a CDN by default, which breaks offline use and is not allowed for Obsidian plugins. To keep the plugin self-contained and fully offline, the font is compiled into `main.js` at build time (via VexFlow's Bravura entry, which carries the font as embedded data) and is loaded from that embedded data — no network request is ever made.

### VexFlow — MIT License

VexFlow ([github.com/vexflow/vexflow](https://github.com/vexflow/vexflow)) is used for music engraving and is bundled under the MIT License:

```
VexFlow - Music Engraving in JavaScript

Copyright (c) 2010-2022 Mohit Muthanna Cheppudira
Copyright (c) 2023-present VexFlow contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Bravura font — SIL Open Font License 1.1

The **Bravura** music font ([github.com/steinbergmedia/bravura](https://github.com/steinbergmedia/bravura)) is embedded in `main.js` at build time and is distributed under the SIL Open Font License, Version 1.1. The OFL permits embedding and redistributing the font (including with commercial software) as long as it is not sold on its own and each copy keeps the copyright notice and this license.

```
Copyright © 2019, Steinberg Media Technologies GmbH (http://www.steinberg.net/),
with Reserved Font Name "Bravura".

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
https://openfontlicense.org

-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply to any
document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical writer
or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining a
copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in
Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or in
the appropriate machine-readable metadata fields within text or binary
files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any Modified
Version, except to acknowledge the contribution(s) of the Copyright
Holder(s) and the Author(s) or with their explicit written permission.

5) The Font Software, modified or unmodified, in part or in whole, must be
distributed entirely under this license, and must not be distributed under
any other license. The requirement for fonts to remain under this license
does not apply to any document created using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are not
met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM OTHER
DEALINGS IN THE FONT SOFTWARE.
```

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Riccardo Silvestri.
