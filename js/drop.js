function dropHandler(element, callback, hoverCallback = null) {
  let api = null;
  let dragging = false;
  let dropX = null;
  let dropY = null;
  function handleDataTransferFiles(dataTransfer, event) {
      let files = Array.from(dataTransfer.files);
      let foundFiles = false;
      files.forEach(function (f) {
          foundFiles = true;
          callback(f, event, api);
      });
      return foundFiles;
  }
  function b(x) {
      return typeof x === "undefined" || x === null || x;
  }
  function dragOver(e) {
      e.dataTransfer.dropEffect = "copy";
      dropX = e.clientX;
      dropY = e.clientY;
      dragging = true;
      if (!hoverCallback || b(hoverCallback(e, api))) {
          e.stopPropagation();
          e.preventDefault();
      }
      else {
          dragging = false;
      }
      this.classList.toggle("dragOver", dragging);
  }
  function drop(e) {
      handleDataTransferFiles(e.dataTransfer, e);
      dragging = false;
      if (!hoverCallback || b(hoverCallback(e, api))) {
          e.stopPropagation();
          e.preventDefault();
      }
      this.classList.remove("dragOver");
      dropX = dropY = null;
  }
  function dragEnter(e) {
      dragging = true;
      dropX = e.clientX;
      dropY = e.clientY;
      if (hoverCallback && !b(hoverCallback(e, api))) {
          dragging = false;
      }
      this.classList.toggle("dragOver", dragging);
  }
  function dragLeave(e) {
      this.classList.remove("dragOver");
      dragging = false;
      dropX = dropY = null;
      if (hoverCallback)
          hoverCallback(e, api);
  }
  let bound = false;
  class Access {
      bind() {
          if (bound)
              return;
          bound = true;
          element.addEventListener("dragover", dragOver, false);
          element.addEventListener("drop", drop, false);
          element.addEventListener("dragenter", dragEnter, false);
          element.addEventListener("dragleave", dragLeave, false);
      }
      unbind() {
          if (!bound)
              return;
          element.removeEventListener("dragover", dragOver, false);
          element.removeEventListener("drop", drop, false);
          element.removeEventListener("dragenter", dragEnter, false);
          element.removeEventListener("dragleave", dragLeave, false);
          bound = false;
          dragging = false;
      }
      get dragging() { return dragging; }
      get dropX() { return dropX; }
      get dropY() { return dropY; }
  }
  api = new Access();
  api.bind();
  return api;
}
