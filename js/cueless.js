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

function decodeBase64EncodedBytes(bytes) {
  const s = utf8.decode(new Uint8Array(bytes).buffer);
  return utf8.decode(base64Decode(s).buffer);
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
  const node = document.createTextNode(args.map(e => {
    if (typeof e === "object")
      return looseJson(e);
    return e;
  }).join(" "));
  const entry = document.createElement("div");
  entry.appendChild(node);
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
  cues.forEach(cue => {
    const point = divWithClass("cuePoint");
    const pin = divWithClass("cuePin");
    const desc = divWithClass("cueDescription");

    pin.style.left = (cue.time / duration * 100)+"%";


    desc.textContent = formatTime(cue.time)+" "+cue.name;
    if (!cue.name)
      desc.appendChild(tagWithContent("i", "\u00a0<no name>"))

    point.appendChild(pin);
    point.appendChild(desc);
    tl.appendChild(point);
    if (player) {
      point.addEventListener("click", () => {
        player.currentTime = cue.time;
        if (player.paused) {
          player.play();
        }
      });
    }
  });
}

async function processBlob(blob) {
  print("Reading", blob.name, "of type", blob.type);
  const audioInfoPromise = getAudioInfo(blob);
  const blobBuffer = await loadBlobToBuffer(blob);
  const audioInfo = await audioInfoPromise;
  const player = audioInfo.player;
  player.controls = true;
  let tagEditor = new MP3Tag(blobBuffer);
  console.log(tagEditor);
  let tags = tagEditor.read();
  console.log(tags);
  let embedded = Object.fromEntries(tags.v2.GEOB.map(e => [e.description, e]));
  print("GEOBs:", Object.keys(embedded));
  let cuePoints = embedded["CuePoints"];
  if (cuePoints) {
    const cueJson = decodeBase64EncodedBytes(cuePoints.object);
    print("Found (Serato?) cue points:", cueJson);
    cuePoints = JSON.parse(cueJson);
    console.log(cuePoints);
  }
  const view = fileTemplate.cloneNode(true);
  view.querySelector(".filename").textContent = blob.name;
  const contents = view.querySelector(".fileContents");
  if (cuePoints) {
    const cues = cuePoints.cues.map(e => ({time: e.time * 1e-3, name: e.name }));
    const title = ["CuePoints"];
    if (cuePoints.source)
      title.push("("+cuePoints.source+")");
    generateCues(title.join(" "), audioInfo.duration, cues, view.querySelector(".cueView"), player);
  }
  for (let field of ["Title", "Artist", "Album"])
    contents.querySelector(".song"+field).textContent = tags[field.toLowerCase()];
  contents.appendChild(player);
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
