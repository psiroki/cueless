const utf8Decoder = new TextDecoder("utf-8", {fatal: true});
const utf8Encoder = new TextEncoder();
const utf8 = {
  decode: utf8Decoder.decode.bind(utf8Decoder),
  encode: utf8Encoder.encode.bind(utf8Encoder)
};
const fileContainer = document.querySelector(".main");
const fileTemplate = document.querySelector(".file.template");
fileTemplate.remove();
fileTemplate.classList.remove("template");
const domConsole = document.querySelector("#console");
while (domConsole.firstChild) domConsole.firstChild.remove();

function base64Decode(s) {
  const binaryString = atob(s);
  const len = binaryString.length;
  const result = new Uint8Array(len);
  for (let i = 0; i < len; ++i)
    result[i] = binaryString.charCodeAt(i);
  return result;
}

function base64Encode(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64EncodedBuffer(bytes) {
  const s = utf8.decode(new Uint8Array(bytes).buffer);
  return base64Decode(s).buffer;
}

function decodeBase64EncodedString(bytes) {
  return utf8.decode(decodeBase64EncodedBuffer(bytes));
}

/// Finds an element index by using the comparator function.
/// The comparator function should return 1 if the value we
/// are looking for is greater, 0 if equal to, and -1 if
/// less than the value it was passed in the argument.
/// Returns the index if found, or `-insertionPoint - 1`
/// otherwise.
function customBinarySearch(sortedList, compareTo) {
  let min = 0;
  let max = sortedList.length;
  while (min < max) {
    let mid = min + ((max - min) >> 1);
    let element = sortedList[mid];
    const comp = compareTo(element);
    if (comp === 0) return mid;
    if (comp > 0) {
      min = mid + 1;
    } else {
      max = mid;
    }
  }
  return -min - 1;
}

const two32 = Math.pow(2, 32);

class BufferReader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.pos = 0;
  }

  seek(newPos) {
    this.pos = newPos;
  }

  relativeSeek(delta) {
    this.pos += delta;
    if (this.pos < 0) this.pos = 0;
  }

  remaining() {
    return this.view.byteLength - this.pos;
  }

  eob() {
    return this.pos >= this.view.byteLength;
  }

  readByte() {
    return this.view.getUint8(this.pos++);
  }

  readInt32() {
    const p = this.pos;
    this.pos += 4;
    return this.view.getUint32(p, true);
  }

  readInt64() {
    const p = this.pos;
    this.pos += 8;
    // 64 bit integers are used only for file offsets
    // this is not going to work well if the file is larger
    // than not going to work well for file size is greater or
    // equal to 4503599627370496 bytes (4096 TiB)
    return this.view.getUint32(p, true) + this.view.getUint32(p + 4, true) * two32;
  }

  readDouble() {
    const p = this.pos;
    this.pos += 8;
    return this.view.getFloat64(p, true);
  }

  readFloat() {
    const p = this.pos;
    this.pos += 4;
    return this.view.getFloat32(p, true);
  }

  readShort() {
    const p = this.pos;
    this.pos += 2;
    return this.view.getUint16(p, true);
  }

  readShorts(count) {
    const p = this.pos;
    if (p & 1) {
      const result = new Uint16Array(count);
      for (let i = 0; i < count; ++i)
        result[i] = this.readShort();
      return result;
    }
    this.pos += count * 2;
    return new Uint16Array(this.view.buffer, this.view.byteOffset + p, count);
  }

  readBytes(count) {
    const p = this.pos;
    this.pos += count;
    return new Uint8Array(this.view.buffer, this.view.byteOffset + p, count);
  }
}

const bufferChunkSize = 4096;

class BufferBuilder {
  constructor() {
    this.view = new DataView(new ArrayBuffer(bufferChunkSize));
    this.pos = 0;
  }

  _allocate(additionalBytes) {
    const newEnd = this.pos + additionalBytes;
    if (newEnd > this.view.byteLength) {
      const newArray = new Uint32Array(this.view.byteLength + bufferChunkSize + 3 >>> 2);
      newArray.set(new Uint32Array(this.view.buffer));
      this.view = new DataView(newArray.buffer);
    }
  }

  writeByte(b) {
    this._allocate(1);
    this.view.setUint8(this.pos++, b);
    return this;
  }

  writeInt32(i) {
    this._allocate(4);
    const p = this.pos;
    this.pos += 4;
    this.view.setUint32(p, i, true);
    return this;
  }

  writeInt64(i) {
    this._allocate(8);
    const p = this.pos;
    this.pos += 8;
    // 64 bit integers are used only for file offsets
    // this is not going to work well if the file is larger
    // than or is exactly 4503599627370496 bytes (4096 TiB)
    this.view.setUint32(p, i, true);
    this.view.setUint32(p + 4, Math.floor(i / two32), true);
    return this;
  }

  writeDouble(d) {
    this._allocate(8);
    const p = this.pos;
    this.pos += 8;
    this.view.setFloat64(p, d, true);
    return this;
  }

  writeFloat(f) {
    this._allocate(4);
    const p = this.pos;
    this.pos += 4;
    this.view.setFloat32(p, f, true);
    return this;
  }

  writeShort(s) {
    this._allocate(2);
    const p = this.pos;
    this.pos += 2;
    this.view.setUint16(p, s, true);
    return this;
  }

  writeShorts(array) {
    this._allocate(array.length * 2);
    const p = this.pos;
    if (p & 1) {
      for (let i = 0; i < array.length; ++i) {
        this.writeShort(array[i]);
      }
      return this;
    }
    this.pos += array.length * 2;
    new Uint16Array(this.view.buffer, this.view.byteOffset + p, array.length).set(array);
    return this;
  }

  writeBytes(array) {
    this._allocate(array.length);
    const p = this.pos;
    this.pos += array.length;
    new Uint8Array(this.view.buffer, this.view.byteOffset + p, array.length).set(array);
    return this;
  }

  toByteArray() {
    const result = new Uint8Array(this.pos);
    result.set(new Uint8Array(this.view.buffer, 0, this.pos));
    return result;
  }

  toBuffer() {
    return this.toByteArray().buffer;
  }
}

function stringCharCodes(s) {
  const l = s.length;
  const result = new Uint16Array(l);
  for (let i = 0; i < l; ++i) {
    result[i] = s.charCodeAt(i);
  }
  return result;
}

function latin1Bytes(s) {
  const l = s.length;
  const result = new Uint8Array(l);
  for (let i = 0; i < l; ++i) {
    result[i] = s.charCodeAt(i);
  }
  return result;
}

Array.prototype.removeWhere = function(test) {
  for (let i = this.length-1; i >= 0; --i) {
    if (test(this[i])) {
      this.splice(i, 1);
    }
  }
}

function looseJson(obj) {
  const result = [];
  let encode = node => {
    if (node instanceof Array) {
      result.push("[ ");
      let first = true;
      for (let n of node) {
        if (first) {
          first = false;
        } else {
          result.push(", ");
        }
        encode(n);
      }
      result.push(" ]");
    } else if (node && typeof node === "object") {
      result.push("{ ");
      let first = true;
      for (let e of Object.entries(node)) {
        if (first) {
          first = false;
        } else {
          result.push(", ");
        }
        encode(e[0]);
        result.push(": ");
        encode(e[1]);
      }
      result.push(" }");
    } else {
      result.push(JSON.stringify(node));
    }
  };
  encode(obj);
  return result.join("");
}

function print(...args) {
  const contents = document.createDocumentFragment();
  let parts = [];
  for (let arg of args) {
    if (typeof arg === "object") {
      parts.push("");
      contents.appendChild(document.createTextNode(parts.join(" ")));
      parts = [""];
      const span = document.createElement("span");
      span.className = "clickToSelect";
      span.addEventListener("click", e => {
        const r = document.createRange();
        r.selectNode(e.currentTarget);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(r);
      });
      span.textContent = looseJson(arg);
      contents.appendChild(span);
    } else {
      parts.push(arg);
    }
  }
  if (parts.length > 1 || parts.length === 1 && parts[0] !== "")
    contents.appendChild(document.createTextNode(parts.join(" ")));
  const entry = document.createElement("div");
  entry.appendChild(contents);
  domConsole.appendChild(entry);
  entry.scrollIntoView();
}

function loadBlobToBuffer(blob) {
  return new Promise((resolve, reject) => {
    let fr = new FileReader();
    fr.onload = () => {
      resolve(fr.result);
    };
    fr.onerror = e => {
      reject(e);
    };
    fr.readAsArrayBuffer(blob);
  });
}

function getAudioInfo(blob) {
  return new Promise((resolve, reject) => {
    const player = document.createElement("audio");
    const blobUrl = URL.createObjectURL(blob);
    player.onloadedmetadata = () => {
      resolve({
        blobUrl,
        player,
        duration: player.duration,
        dispose() {
          URL.revokeObjectURL(this.blobUrl);
          this.player = null;
        }
      });
    };
    player.onerror = e => { reject(e); };
    player.src = blobUrl;
  });
}

function divWithClass(cls) {
  const result = document.createElement("div");
  result.className = cls;
  return result;
}

function tagWithContent(tag, s) {
  const result = document.createElement(tag);
  result.textContent = s;
  return result;
}

function formatTime(timeInSecs) {
  let secs = timeInSecs % 60;
  let minutes = (timeInSecs - secs) / 60 | 0;
  let hours = minutes / 60 | 0;
  let parts = [];
  if (hours) {
    parts.push(hours, minutes - hours * 60);
  } else {
    parts.push(minutes);
  }
  parts.push(secs.toFixed(3).padStart(6, "0"));
  return parts.map((e, i) => i > 0 && typeof e === "number" ? e.toString().padStart(2, "0") : e)
    .join(":");
}

function generateCues(title, duration, cues, view, player) {
  view.querySelector(".cueTitle").textContent = title;
  const tl = view.querySelector(".cueTimeline");
  tl.textContent = "";
  const cl = view.querySelector(".cueList");
  const seek = t => {
    player.currentTime = t;
    if (player.paused) {
      player.play();
    }
  };
  cues.forEach(cue => {
    const point = divWithClass("cuePoint");
    const pin = divWithClass("cuePin");
    const desc = divWithClass("cueDescription");

    pin.style.left = (cue.time / duration * 100)+"%";

    const option = document.createElement("option");
    cl.appendChild(option);
    for (let item of [desc, option]) {
      item.textContent = formatTime(cue.time)+" "+cue.name;
      if (!cue.name)
        item.appendChild(tagWithContent("i", "\u00a0<no name>"))
      if (typeof cue.index !== "undefined") {
        item.appendChild(document.createTextNode(" ("+cue.index+")"));
      }
      option.setAttribute("value", cue.time);
    }

    point.appendChild(pin);
    point.appendChild(desc);
    tl.appendChild(point);
    if (player) {
      point.addEventListener("click", () => {
        seek(cue.time);
      });
    }
  });
  cl.addEventListener("input", _ => {
    const time = +cl.value;
    if (!isNaN(time))
      seek(time);
  });
}

function parseMp3Header(headerBytes) {
  const header = Array.from(headerBytes);
  if (header[0] !== 0xff || (header[1] & 0xe0) !== 0xe0) {
    return null;
  }
  const versionLookup = ["MPEG2.5", "reserved", "MPEG2", "MPEG1"]
  const layerLookup = ["reserved", "Layer3", "Layer2", "Layer1"];
  const version = versionLookup[header[1] >>> 3 & 3];
  if (version === "reserved") return null;
  const layer = layerLookup[(header[1] >> 1 & 3)];
  if (layer === "reserved") return null;
  const mp2l1 = ["free", 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, "bad"];
  const mp2l23 = ["free", 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, "bad"];
  const bitrates = {
    "MPEG1/Layer1":
      ["free", 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, "bad"],
    "MPEG1/Layer2":
      ["free", 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, "bad"],
    "MPEG1/Layer3":
      ["free", 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, "bad"],
    "MPEG2/Layer1": mp2l1,
    "MPEG2/Layer2": mp2l23,
    "MPEG2/Layer3": mp2l23,
    "MPEG2.5/Layer1": mp2l1,
    "MPEG2.5/Layer2": mp2l23,
    "MPEG2.5/Layer3": mp2l23
  };
  const sampleRates = {
    "MPEG1": [44100, 48000, 11025, "reserved"],
    "MPEG2": [22050, 24000, 12000, "reserved"],
    "MPEG2.5": [11025, 16000, 8000, "reserved"]
  };
  const samplesPerFrame = {
    "MPEG1/Layer1": 384,
    "MPEG1/Layer2": 1152,
    "MPEG1/Layer3": 1152,
    "MPEG2/Layer1": 384,
    "MPEG2/Layer2": 1152,
    "MPEG2/Layer3": 576,
    "MPEG2.5/Layer1": 384,
    "MPEG2.5/Layer2": 1152,
    "MPEG2.5/Layer3": 576
  };
  const channelModes = ["stereo", "jointStereo", "dualChannel", "singleChannel"];

  const bitrate = bitrates[version+"/"+layer][header[2] >>> 4];
  if (isNaN(bitrate)) return null;
  const sampleRate = sampleRates[version][header[2] >>> 2 & 3];
  if (isNaN(sampleRate)) return null;
  const padding = header[2] >>> 1 & 1;
  const frameLength = 144000*bitrate/sampleRate + padding|0;
  return {
    version,
    layer,
    protected: !!(header[1] & 1),
    bitrate,
    sampleRate,
    padding,
    private: !!(header[2] & 1),
    channelMode: channelModes[header[3] >>> 6],
    modeExtension: header[3] >>> 4 & 3,
    copyright: !!(header[3] >>> 3 & 1),
    original: !!(header[3] >>> 2 & 1),
    emphasis: header[3] & 3,
    frameLength,
    samplesInFrame: samplesPerFrame[version+"/"+layer]
  };
}

function processMp3(buffer) {
  const reader = new BufferReader(buffer);
  let count = 4;
  const byteOffsets = [];
  let time = 0;
  let expectingHeader = false;
  while (reader.remaining() >= 4 && !reader.eob()) {
    const pos = reader.pos;
    if (reader.readByte() === 0xff) {
      reader.relativeSeek(-1);
      const header = Array.from(reader.readBytes(4));
      if ((header[1] & 0xe0) === 0xe0) {
        parsed = parseMp3Header(header);
        if (parsed?.layer === "Layer3" && parsed.frameLength > 4) {
          byteOffsets.push({
            time, offset: pos, header: parsed
          });
          reader.relativeSeek(parsed.frameLength-4);
          // console.log("Found frame at "+pos+": "+header.map(e => e.toString(2).padStart(8, "0"))+
          //   "\nNext is expected at "+reader.pos);
          time += parsed.samplesInFrame / parsed.sampleRate;
          expectingHeader = true;
        }
      } else {
        reader.relativeSeek(-3);
      }
    } else if (expectingHeader) {
      expectingHeader = false;
      if (reader.remaining() > 256) {
        console.log("Was expecting frame header at "+pos+" but have found garbage");
      }
    }
  }
  console.log("Time is "+formatTime(time)+
    "\nSize is "+reader.pos / 1024 +"k");
  return { byteOffsets };
}

async function processBlob(blob) {
  print("Reading", blob.name, "of type", blob.type);
  const audioInfoPromise = getAudioInfo(blob);
  const blobBuffer = await loadBlobToBuffer(blob);
  const audioInfo = await audioInfoPromise;
  const player = audioInfo.player;
  const frameInfo = processMp3(blobBuffer);
  player.controls = true;
  let tagEditor = new MP3Tag(blobBuffer);
  let changed = false;
  console.log(tagEditor);
  let tags = tagEditor.read();
  console.log(tags);
  let embedded = Object.fromEntries(tags.v2.GEOB.map(e => [e.description, e]));
  print("GEOBs:", Object.keys(embedded));
  const view = fileTemplate.cloneNode(true);
  view.querySelector(".filename").textContent = blob.name;
  const contents = view.querySelector(".fileContents");
  const cueViewTemplate = view.querySelector(".cueView");
  const saveTemplate = view.querySelector(".savePanel");
  saveTemplate.remove();
  const cueViewParent = cueViewTemplate.parentNode;
  cueViewTemplate.remove();

  contents.appendChild(player);

  let cuePoints = embedded["CuePoints"];
  if (cuePoints) {
    const cueJson = decodeBase64EncodedString(cuePoints.object);
    cuePoints = JSON.parse(cueJson);
    print("Found (Serato?) cue points:", cuePoints);
    const cues = cuePoints.cues.map(e => ({time: e.time * 1e-3, name: e.name }));
    const title = ["CuePoints"];
    if (cuePoints.source)
      title.push("("+cuePoints.source+")");
    const cueView = cueViewTemplate.cloneNode(true);
    cueViewParent.appendChild(cueView);
    generateCues(title.join(" "), audioInfo.duration, cues, cueView, player);
  }

  let cueData = embedded["DJUCED_CUE_DATA"];
  const forceConversion = true;
  if ((forceConversion || !cueData) && cuePoints) {
    const byteOffsets = frameInfo.byteOffsets;
    const cueBuffer = new BufferBuilder().writeByte(1);
    let index = 0;
    for (let cp of cuePoints.cues) {
      const time = cp.time * 1e-3;
      let offsetIndex = customBinarySearch(byteOffsets, desc => time - desc.time);
      if (offsetIndex < 0) offsetIndex = -offsetIndex - 2;
      const frame = byteOffsets[offsetIndex];
      let nameLength = cp.name.length + 1;
      cueBuffer
        .writeInt32(++index)
        .writeDouble(time)
        .writeInt64(frame.offset)
        .writeShort(nameLength)
        .writeShorts(stringCharCodes(cp.name))
        .writeShort(0);
    }
    const newCueData = {
      description: "DJUCED_CUE_DATA",
      filename: "",
      format: "",
      object: latin1Bytes(base64Encode(cueBuffer.toByteArray()))
    };
    tags.v2.GEOB.removeWhere(geob => geob.description === "DJUCED_CUE_DATA");
    tags.v2.GEOB.push(newCueData);
    changed = true;
  }
  if (cueData) {
    console.log(cueData);
    const reader = new BufferReader(decodeBase64EncodedBuffer(cueData.object));
    const version = reader.readByte();
    const cueSets = [[], []];
    const byteOffsets = frameInfo.byteOffsets;
    while (!reader.eob()) {
      const cue = {};
      cue.index = reader.readInt32();
      cue.time = reader.readDouble();
      cue.byteOffset = reader.readInt64();
      let offsetIndex = customBinarySearch(byteOffsets, desc => cue.time - desc.time);
      if (offsetIndex < 0) offsetIndex = -offsetIndex - 2;
      const frame = byteOffsets[offsetIndex];
      console.log("Byte offset error is "+(frame?.offset - cue.byteOffset)*1e-3+
        "k ("+cue.byteOffset+" vs "+frame.offset+", frame index is "+offsetIndex+")\n"+
        "time error is "+(frame?.time - cue.time)+" ("+formatTime(cue.time)+")");
      if (version >= 2)
        cue.loop = reader.readFloat();
      if (version >= 3)
        cue.color = reader.readInt32();
      const nameLength = reader.readShort();
      const nameCodes = reader.readShorts(nameLength);
      cue.name = String.fromCharCode(nameCodes).replace(/\u0000$/, "");
      cueSets[cue.index >= 1000 ? 1 : 0].push(cue);
    }
    cueSets.forEach((cues, index) => {
      if (!cues.length) return;
      const cueView = cueViewTemplate.cloneNode(true);
      cueViewParent.appendChild(cueView);
      const suffix = index ? " (indexes over 1000)" : "";
      generateCues("DJUCED_CUE_DATA"+suffix, audioInfo.duration, cues, cueView, player);
      print("Found and decoded DJUCED cue points:", cues);
    });
  }

  for (let field of ["Title", "Artist", "Album"]) {
    contents.querySelector(".song"+field).textContent = tags[field.toLowerCase()];
  }
  if (changed) {
    const newFile = new Blob([tagEditor.save()], { type: "audio/mp3" });
    const save = saveTemplate.cloneNode(true);
    const anchor = save.querySelector("a");
    anchor.href = URL.createObjectURL(newFile);
    anchor.download = blob.name || "file.mp3";
    contents.appendChild(save);
  }
  fileContainer.appendChild(view);
}

const dropBox = document.querySelector(".dropBox");
dropHandler(dropBox, blob => processBlob(blob));
dropBox.addEventListener("click", _ => {
  dropBox.querySelector("input[type=file]")?.click();
});
dropBox.querySelector("input[type=file]")?.addEventListener("change", e => {
  Array.from(e.currentTarget.files).forEach(blob => processBlob(blob));
});
