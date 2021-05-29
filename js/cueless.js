const utf8Decoder = new TextDecoder("utf-8", {fatal: true});
const utf8Encoder = new TextEncoder();
const utf8 = {
  decode: utf8Decoder.decode.bind(utf8Decoder),
  encode: utf8Encoder.encode.bind(utf8Encoder)
};
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

function processBlob(blob) {
  print("Reading", blob.name, "of type", blob.type);
  let fr = new FileReader();
  fr.onload = () => {
    let tagEditor = new MP3Tag(fr.result);
    let tags = tagEditor.read();
    console.log(tags);
    let embedded = Object.fromEntries(tags.v2.GEOB.map(e => [e.description, e]));
    print("GEOBs:", Object.keys(embedded));
    let cuePoints = embedded["CuePoints"];
    if (cuePoints) {
      const cueJson = decodeBase64EncodedBytes(cuePoints.object);
      print("Found (Serato?) cue points:", cueJson);
      console.log(JSON.parse(cueJson));
    }
  };
  fr.onerror = e => {
    print("Error loading", blob.name);
  };
  fr.readAsArrayBuffer(blob);
}

const dropBox = document.querySelector(".dropBox");
dropHandler(dropBox, blob => processBlob(blob));
dropBox.addEventListener("click", _ => {
  dropBox.querySelector("input[type=file]")?.click();
});
