
var Rive = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  
  return (
function(moduleArg = {}) {
  var moduleRtn;

var l = moduleArg, ca, da, ea = new Promise((a, b) => {
  ca = a;
  da = b;
}), fa = "object" == typeof window, ia = "function" == typeof importScripts;
function ja() {
  function a(g) {
    const k = d;
    c = b = 0;
    d = new Map();
    k.forEach(p => {
      try {
        p(g);
      } catch (n) {
        console.error(n);
      }
    });
    this.ob();
    e && e.Rb();
  }
  let b = 0, c = 0, d = new Map(), e = null, f = null;
  this.requestAnimationFrame = function(g) {
    b ||= requestAnimationFrame(a.bind(this));
    const k = ++c;
    d.set(k, g);
    return k;
  };
  this.cancelAnimationFrame = function(g) {
    d.delete(g);
    b && 0 == d.size && (cancelAnimationFrame(b), b = 0);
  };
  this.Pb = function(g) {
    f && (document.body.remove(f), f = null);
    g || (f = document.createElement("div"), f.style.backgroundColor = "black", f.style.position = "fixed", f.style.right = 0, f.style.top = 0, f.style.color = "white", f.style.padding = "4px", f.innerHTML = "RIVE FPS", g = function(k) {
      f.innerHTML = "RIVE FPS " + k.toFixed(1);
    }, document.body.appendChild(f));
    e = new function() {
      let k = 0, p = 0;
      this.Rb = function() {
        var n = performance.now();
        p ? (++k, n -= p, 1000 < n && (g(1000 * k / n), k = p = 0)) : (p = n, k = 0);
      };
    }();
  };
  this.Mb = function() {
    f && (document.body.remove(f), f = null);
    e = null;
  };
  this.ob = function() {
  };
}
function ka(a) {
  console.assert(!0);
  const b = new Map();
  let c = -Infinity;
  this.push = function(d) {
    d = d + ((1 << a) - 1) >> a;
    b.has(d) && clearTimeout(b.get(d));
    b.set(d, setTimeout(function() {
      b.delete(d);
      0 == b.length ? c = -Infinity : d == c && (c = Math.max(...b.keys()), console.assert(c < d));
    }, 1000));
    c = Math.max(d, c);
    return c << a;
  };
}
const la = l.onRuntimeInitialized;
l.onRuntimeInitialized = function() {
  la && la();
  let a = l.decodeAudio;
  l.decodeAudio = function(f, g) {
    f = a(f);
    g(f);
  };
  let b = l.decodeFont;
  l.decodeFont = function(f, g) {
    f = b(f);
    g(f);
  };
  let c = l.setFallbackFontCb;
  l.setFallbackFontCallback = "function" === typeof c ? function(f) {
    c(f);
  } : function() {
    console.warn("Module.setFallbackFontCallback called, but text support is not enabled in this build.");
  };
  const d = l.FileAssetLoader;
  l.ptrToAsset = f => {
    let g = l.ptrToFileAsset(f);
    return g.isImage ? l.ptrToImageAsset(f) : g.isFont ? l.ptrToFontAsset(f) : g.isAudio ? l.ptrToAudioAsset(f) : g;
  };
  l.CustomFileAssetLoader = d.extend("CustomFileAssetLoader", {__construct:function({loadContents:f}) {
    this.__parent.__construct.call(this);
    this.Eb = f;
  }, loadContents:function(f, g) {
    f = l.ptrToAsset(f);
    return this.Eb(f, g);
  },});
  l.CDNFileAssetLoader = d.extend("CDNFileAssetLoader", {__construct:function() {
    this.__parent.__construct.call(this);
  }, loadContents:function(f) {
    let g = l.ptrToAsset(f);
    f = g.cdnUuid;
    if ("" === f) {
      return !1;
    }
    (function(k, p) {
      var n = new XMLHttpRequest();
      n.responseType = "arraybuffer";
      n.onreadystatechange = function() {
        4 == n.readyState && 200 == n.status && p(n);
      };
      n.open("GET", k, !0);
      n.send(null);
    })(g.cdnBaseUrl + "/" + f, k => {
      g.decode(new Uint8Array(k.response));
    });
    return !0;
  },});
  l.FallbackFileAssetLoader = d.extend("FallbackFileAssetLoader", {__construct:function() {
    this.__parent.__construct.call(this);
    this.kb = [];
  }, addLoader:function(f) {
    this.kb.push(f);
  }, loadContents:function(f, g) {
    for (let k of this.kb) {
      if (k.loadContents(f, g)) {
        return !0;
      }
    }
    return !1;
  },});
  let e = l.computeAlignment;
  l.computeAlignment = function(f, g, k, p, n = 1.0) {
    return e.call(this, f, g, k, p, n);
  };
};
const ma = "createConicGradient createImageData createLinearGradient createPattern createRadialGradient getContextAttributes getImageData getLineDash getTransform isContextLost isPointInPath isPointInStroke measureText".split(" "), na = new function() {
  function a() {
    if (!b) {
      var m = document.createElement("canvas"), u = {alpha:1, depth:0, stencil:0, antialias:0, premultipliedAlpha:1, preserveDrawingBuffer:0, powerPreference:"high-performance", failIfMajorPerformanceCaveat:0, enableExtensionsByDefault:1, explicitSwapControl:1, renderViaOffscreenBackBuffer:1,};
      let r;
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        if (r = m.getContext("webgl", u), c = 1, !r) {
          return console.log("No WebGL support. Image mesh will not be drawn."), !1;
        }
      } else {
        if (r = m.getContext("webgl2", u)) {
          c = 2;
        } else {
          if (r = m.getContext("webgl", u)) {
            c = 1;
          } else {
            return console.log("No WebGL support. Image mesh will not be drawn."), !1;
          }
        }
      }
      r = new Proxy(r, {get(I, w) {
        if (I.isContextLost()) {
          if (p || (console.error("Cannot render the mesh because the GL Context was lost. Tried to invoke ", w), p = !0), "function" === typeof I[w]) {
            return function() {
            };
          }
        } else {
          return "function" === typeof I[w] ? function(...L) {
            return I[w].apply(I, L);
          } : I[w];
        }
      }, set(I, w, L) {
        if (I.isContextLost()) {
          p || (console.error("Cannot render the mesh because the GL Context was lost. Tried to set property " + w), p = !0);
        } else {
          return I[w] = L, !0;
        }
      },});
      d = Math.min(r.getParameter(r.MAX_RENDERBUFFER_SIZE), r.getParameter(r.MAX_TEXTURE_SIZE));
      function D(I, w, L) {
        w = r.createShader(w);
        r.shaderSource(w, L);
        r.compileShader(w);
        L = r.getShaderInfoLog(w);
        if (0 < (L || "").length) {
          throw L;
        }
        r.attachShader(I, w);
      }
      m = r.createProgram();
      D(m, r.VERTEX_SHADER, "attribute vec2 vertex;\n                attribute vec2 uv;\n                uniform vec4 mat;\n                uniform vec2 translate;\n                varying vec2 st;\n                void main() {\n                    st = uv;\n                    gl_Position = vec4(mat2(mat) * vertex + translate, 0, 1);\n                }");
      D(m, r.FRAGMENT_SHADER, "precision highp float;\n                uniform sampler2D image;\n                varying vec2 st;\n                void main() {\n                    gl_FragColor = texture2D(image, st);\n                }");
      r.bindAttribLocation(m, 0, "vertex");
      r.bindAttribLocation(m, 1, "uv");
      r.linkProgram(m);
      u = r.getProgramInfoLog(m);
      if (0 < (u || "").trim().length) {
        throw u;
      }
      e = r.getUniformLocation(m, "mat");
      f = r.getUniformLocation(m, "translate");
      r.useProgram(m);
      r.bindBuffer(r.ARRAY_BUFFER, r.createBuffer());
      r.enableVertexAttribArray(0);
      r.enableVertexAttribArray(1);
      r.bindBuffer(r.ELEMENT_ARRAY_BUFFER, r.createBuffer());
      r.uniform1i(r.getUniformLocation(m, "image"), 0);
      r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !0);
      b = r;
    }
    return !0;
  }
  let b = null, c = 0, d = 0, e = null, f = null, g = 0, k = 0, p = !1;
  a();
  this.cc = function() {
    a();
    return d;
  };
  this.Lb = function(m) {
    b.deleteTexture && b.deleteTexture(m);
  };
  this.Kb = function(m) {
    if (!a()) {
      return null;
    }
    const u = b.createTexture();
    if (!u) {
      return null;
    }
    b.bindTexture(b.TEXTURE_2D, u);
    b.texImage2D(b.TEXTURE_2D, 0, b.RGBA, b.RGBA, b.UNSIGNED_BYTE, m);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_WRAP_S, b.CLAMP_TO_EDGE);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_WRAP_T, b.CLAMP_TO_EDGE);
    b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MAG_FILTER, b.LINEAR);
    2 == c ? (b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MIN_FILTER, b.LINEAR_MIPMAP_LINEAR), b.generateMipmap(b.TEXTURE_2D)) : b.texParameteri(b.TEXTURE_2D, b.TEXTURE_MIN_FILTER, b.LINEAR);
    return u;
  };
  const n = new ka(8), t = new ka(8), x = new ka(10), y = new ka(10);
  this.Ob = function(m, u, r, D, I) {
    if (a()) {
      var w = n.push(m), L = t.push(u);
      if (b.canvas) {
        if (b.canvas.width != w || b.canvas.height != L) {
          b.canvas.width = w, b.canvas.height = L;
        }
        b.viewport(0, L - u, m, u);
        b.disable(b.SCISSOR_TEST);
        b.clearColor(0, 0, 0, 0);
        b.clear(b.COLOR_BUFFER_BIT);
        b.enable(b.SCISSOR_TEST);
        r.sort((K, aa) => aa.vb - K.vb);
        w = x.push(D);
        g != w && (b.bufferData(b.ARRAY_BUFFER, 8 * w, b.DYNAMIC_DRAW), g = w);
        w = 0;
        for (var R of r) {
          b.bufferSubData(b.ARRAY_BUFFER, w, R.Ta), w += 4 * R.Ta.length;
        }
        console.assert(w == 4 * D);
        for (var V of r) {
          b.bufferSubData(b.ARRAY_BUFFER, w, V.Bb), w += 4 * V.Bb.length;
        }
        console.assert(w == 8 * D);
        w = y.push(I);
        k != w && (b.bufferData(b.ELEMENT_ARRAY_BUFFER, 2 * w, b.DYNAMIC_DRAW), k = w);
        R = 0;
        for (var qa of r) {
          b.bufferSubData(b.ELEMENT_ARRAY_BUFFER, R, qa.indices), R += 2 * qa.indices.length;
        }
        console.assert(R == 2 * I);
        qa = 0;
        V = !0;
        w = R = 0;
        for (const K of r) {
          K.image.Ja != qa && (b.bindTexture(b.TEXTURE_2D, K.image.Ia || null), qa = K.image.Ja);
          K.ic ? (b.scissor(K.Za, L - K.$a - K.jb, K.vc, K.jb), V = !0) : V && (b.scissor(0, L - u, m, u), V = !1);
          r = 2 / m;
          const aa = -2 / u;
          b.uniform4f(e, K.ha[0] * r * K.Aa, K.ha[1] * aa * K.Ba, K.ha[2] * r * K.Aa, K.ha[3] * aa * K.Ba);
          b.uniform2f(f, K.ha[4] * r * K.Aa + r * (K.Za - K.dc * K.Aa) - 1, K.ha[5] * aa * K.Ba + aa * (K.$a - K.ec * K.Ba) + 1);
          b.vertexAttribPointer(0, 2, b.FLOAT, !1, 0, w);
          b.vertexAttribPointer(1, 2, b.FLOAT, !1, 0, w + 4 * D);
          b.drawElements(b.TRIANGLES, K.indices.length, b.UNSIGNED_SHORT, R);
          w += 4 * K.Ta.length;
          R += 2 * K.indices.length;
        }
        console.assert(w == 4 * D);
        console.assert(R == 2 * I);
      }
    }
  };
  this.canvas = function() {
    return a() && b.canvas;
  };
}(), oa = l.onRuntimeInitialized;
l.onRuntimeInitialized = function() {
  function a(q) {
    switch(q) {
      case n.srcOver:
        return "source-over";
      case n.screen:
        return "screen";
      case n.overlay:
        return "overlay";
      case n.darken:
        return "darken";
      case n.lighten:
        return "lighten";
      case n.colorDodge:
        return "color-dodge";
      case n.colorBurn:
        return "color-burn";
      case n.hardLight:
        return "hard-light";
      case n.softLight:
        return "soft-light";
      case n.difference:
        return "difference";
      case n.exclusion:
        return "exclusion";
      case n.multiply:
        return "multiply";
      case n.hue:
        return "hue";
      case n.saturation:
        return "saturation";
      case n.color:
        return "color";
      case n.luminosity:
        return "luminosity";
    }
  }
  function b(q) {
    return "rgba(" + ((16711680 & q) >>> 16) + "," + ((65280 & q) >>> 8) + "," + ((255 & q) >>> 0) + "," + ((4278190080 & q) >>> 24) / 255 + ")";
  }
  function c() {
    0 < L.length && (na.Ob(w.drawWidth(), w.drawHeight(), L, R, V), L = [], V = R = 0, w.reset(512, 512));
    for (const q of I) {
      for (const v of q.I) {
        v();
      }
      q.I = [];
    }
    I.clear();
  }
  oa && oa();
  var d = l.RenderPaintStyle;
  const e = l.RenderPath, f = l.RenderPaint, g = l.Renderer, k = l.StrokeCap, p = l.StrokeJoin, n = l.BlendMode, t = d.fill, x = d.stroke, y = l.FillRule.evenOdd;
  let m = 1;
  var u = l.RenderImage.extend("CanvasRenderImage", {__construct:function({la:q, wa:v} = {}) {
    this.__parent.__construct.call(this);
    this.Ja = m;
    m = m + 1 & 2147483647 || 1;
    this.la = q;
    this.wa = v;
  }, __destruct:function() {
    this.Ia && (na.Lb(this.Ia), URL.revokeObjectURL(this.Wa));
    this.__parent.__destruct.call(this);
  }, decode:function(q) {
    var v = this;
    v.wa && v.wa(v);
    var J = new Image();
    v.Wa = URL.createObjectURL(new Blob([q], {type:"image/png",}));
    J.onload = function() {
      v.Db = J;
      v.Ia = na.Kb(J);
      v.size(J.width, J.height);
      v.la && v.la(v);
    };
    J.src = v.Wa;
  },}), r = e.extend("CanvasRenderPath", {__construct:function() {
    this.__parent.__construct.call(this);
    this.U = new Path2D();
  }, rewind:function() {
    this.U = new Path2D();
  }, addPath:function(q, v, J, G, A, H, E) {
    var M = this.U, ya = M.addPath;
    q = q.U;
    const T = new DOMMatrix();
    T.a = v;
    T.b = J;
    T.c = G;
    T.d = A;
    T.e = H;
    T.f = E;
    ya.call(M, q, T);
  }, fillRule:function(q) {
    this.Va = q;
  }, moveTo:function(q, v) {
    this.U.moveTo(q, v);
  }, lineTo:function(q, v) {
    this.U.lineTo(q, v);
  }, cubicTo:function(q, v, J, G, A, H) {
    this.U.bezierCurveTo(q, v, J, G, A, H);
  }, close:function() {
    this.U.closePath();
  },}), D = f.extend("CanvasRenderPaint", {color:function(q) {
    this.Xa = b(q);
  }, thickness:function(q) {
    this.Hb = q;
  }, join:function(q) {
    switch(q) {
      case p.miter:
        this.Ha = "miter";
        break;
      case p.round:
        this.Ha = "round";
        break;
      case p.bevel:
        this.Ha = "bevel";
    }
  }, cap:function(q) {
    switch(q) {
      case k.butt:
        this.Ga = "butt";
        break;
      case k.round:
        this.Ga = "round";
        break;
      case k.square:
        this.Ga = "square";
    }
  }, style:function(q) {
    this.Gb = q;
  }, blendMode:function(q) {
    this.Cb = a(q);
  }, clearGradient:function() {
    this.ja = null;
  }, linearGradient:function(q, v, J, G) {
    this.ja = {xb:q, yb:v, cb:J, eb:G, Qa:[],};
  }, radialGradient:function(q, v, J, G) {
    this.ja = {xb:q, yb:v, cb:J, eb:G, Qa:[], bc:!0,};
  }, addStop:function(q, v) {
    this.ja.Qa.push({color:q, stop:v,});
  }, completeGradient:function() {
  }, draw:function(q, v, J, G) {
    let A = this.Gb;
    var H = this.Xa, E = this.ja;
    const M = q.globalCompositeOperation, ya = q.globalAlpha;
    q.globalCompositeOperation = this.Cb;
    q.globalAlpha = G;
    if (null != E) {
      H = E.xb;
      const X = E.yb, ha = E.cb;
      var T = E.eb;
      G = E.Qa;
      E.bc ? (E = ha - H, T -= X, H = q.createRadialGradient(H, X, 0, H, X, Math.sqrt(E * E + T * T))) : H = q.createLinearGradient(H, X, ha, T);
      for (let Y = 0, ba = G.length; Y < ba; Y++) {
        E = G[Y], H.addColorStop(E.stop, b(E.color));
      }
      this.Xa = H;
      this.ja = null;
    }
    switch(A) {
      case x:
        q.strokeStyle = H;
        q.lineWidth = this.Hb;
        q.lineCap = this.Ga;
        q.lineJoin = this.Ha;
        q.stroke(v);
        break;
      case t:
        q.fillStyle = H, q.fill(v, J);
    }
    q.globalCompositeOperation = M;
    q.globalAlpha = ya;
  },});
  const I = new Set();
  let w = null, L = [], R = 0, V = 0;
  var qa = l.CanvasRenderer = g.extend("Renderer", {__construct:function(q) {
    this.__parent.__construct.call(this);
    this.T = [1, 0, 0, 1, 0, 0];
    this.G = [1.0];
    this.B = q.getContext("2d");
    this.Ua = q;
    this.I = [];
  }, save:function() {
    this.T.push(...this.T.slice(this.T.length - 6));
    this.G.push(this.G[this.G.length - 1]);
    this.I.push(this.B.save.bind(this.B));
  }, restore:function() {
    const q = this.T.length - 6;
    if (6 > q) {
      throw "restore() called without matching save().";
    }
    this.T.splice(q);
    this.G.pop();
    this.I.push(this.B.restore.bind(this.B));
  }, transform:function(q, v, J, G, A, H) {
    const E = this.T, M = E.length - 6;
    E.splice(M, 6, E[M] * q + E[M + 2] * v, E[M + 1] * q + E[M + 3] * v, E[M] * J + E[M + 2] * G, E[M + 1] * J + E[M + 3] * G, E[M] * A + E[M + 2] * H + E[M + 4], E[M + 1] * A + E[M + 3] * H + E[M + 5]);
    this.I.push(this.B.transform.bind(this.B, q, v, J, G, A, H));
  }, rotate:function(q) {
    const v = Math.sin(q);
    q = Math.cos(q);
    this.transform(q, v, -v, q, 0, 0);
  }, modulateOpacity:function(q) {
    this.G[this.G.length - 1] *= q;
  }, _drawPath:function(q, v) {
    this.I.push(v.draw.bind(v, this.B, q.U, q.Va === y ? "evenodd" : "nonzero", Math.max(0, this.G[this.G.length - 1])));
  }, _drawRiveImage:function(q, v, J, G) {
    var A = q.Db;
    if (A) {
      var H = this.B, E = a(J), M = Math.max(0, G * this.G[this.G.length - 1]);
      this.I.push(function() {
        H.globalCompositeOperation = E;
        H.globalAlpha = M;
        H.drawImage(A, 0, 0);
        H.globalAlpha = 1;
      });
    }
  }, _getMatrix:function(q) {
    const v = this.T, J = v.length - 6;
    for (let G = 0; 6 > G; ++G) {
      q[G] = v[J + G];
    }
  }, _drawImageMesh:function(q, v, J, G, A, H, E, M, ya, T, X, ha, Y, ba) {
    let ac, bc, cc;
    try {
      ac = l.HEAPF32.slice(A >> 2, (A >> 2) + H), bc = l.HEAPF32.slice(E >> 2, (E >> 2) + M), cc = l.HEAPU16.slice(ya >> 1, (ya >> 1) + T);
    } catch (tb) {
      console.error("[Rive] _drawImageMesh: failed to read mesh data from WASM heap. Mesh skipped for this frame.");
      return;
    }
    v = this.B.canvas.width;
    A = this.B.canvas.height;
    E = Y - X;
    M = ba - ha;
    X = Math.max(X, 0);
    ha = Math.max(ha, 0);
    Y = Math.min(Y, v);
    ba = Math.min(ba, A);
    const Ga = Y - X, Ha = ba - ha;
    console.assert(Ga <= Math.min(E, v));
    console.assert(Ha <= Math.min(M, A));
    if (!(0 >= Ga || 0 >= Ha)) {
      Y = Ga < E || Ha < M;
      v = ba = 1;
      var ra = Math.ceil(Ga * ba), sa = Math.ceil(Ha * v);
      A = na.cc();
      ra > A && (ba *= A / ra, ra = A);
      sa > A && (v *= A / sa, sa = A);
      w || (w = new l.DynamicRectanizer(A), w.reset(512, 512));
      A = w.addRect(ra, sa);
      0 > A && (c(), I.add(this), A = w.addRect(ra, sa), console.assert(0 <= A));
      var dc = A & 65535, ec = A >> 16;
      L.push({ha:this.T.slice(this.T.length - 6), image:q, Za:dc, $a:ec, dc:X, ec:ha, vc:ra, jb:sa, Aa:ba, Ba:v, Ta:ac, Bb:bc, indices:cc, ic:Y, vb:q.Ja << 1 | (Y ? 1 : 0),});
      R += H;
      V += T;
      var za = this.B, rd = a(J), sd = Math.max(0, G * this.G[this.G.length - 1]);
      this.I.push(function() {
        za.save();
        za.resetTransform();
        za.globalCompositeOperation = rd;
        za.globalAlpha = sd;
        const tb = na.canvas();
        tb && za.drawImage(tb, dc, ec, ra, sa, X, ha, Ga, Ha);
        za.restore();
      });
    }
  }, _clipPath:function(q) {
    this.I.push(this.B.clip.bind(this.B, q.U, q.Va === y ? "evenodd" : "nonzero"));
  }, clear:function() {
    I.add(this);
    this.I.push(this.B.clearRect.bind(this.B, 0, 0, this.Ua.width, this.Ua.height));
  }, flush:function() {
  }, translate:function(q, v) {
    this.transform(1, 0, 0, 1, q, v);
  },});
  l.makeRenderer = function(q) {
    const v = new qa(q), J = v.B;
    return new Proxy(v, {get(G, A) {
      if ("function" === typeof G[A]) {
        return function(...H) {
          return G[A].apply(G, H);
        };
      }
      if ("function" === typeof J[A]) {
        if (-1 < ma.indexOf(A)) {
          throw Error("RiveException: Method call to '" + A + "()' is not allowed, as the renderer cannot immediately pass through the return                 values of any canvas 2d context methods.");
        }
        return function(...H) {
          v.I.push(J[A].bind(J, ...H));
        };
      }
      return G[A];
    }, set(G, A, H) {
      if (A in J) {
        return v.I.push(() => {
          J[A] = H;
        }), !0;
      }
    },});
  };
  l.decodeImage = function(q, v) {
    (new u({la:v})).decode(q);
  };
  l.renderFactory = {makeRenderPaint:function() {
    return new D();
  }, makeRenderPath:function() {
    return new r();
  }, makeRenderImage:function() {
    let q = aa;
    return new u({wa:() => {
      q.total++;
    }, la:() => {
      q.loaded++;
      if (q.loaded === q.total) {
        const v = q.ready;
        v && (v(), q.ready = null);
      }
    },});
  },};
  let K = l.load, aa = null;
  l.load = function(q, v, J = !0) {
    const G = new l.FallbackFileAssetLoader();
    void 0 !== v && G.addLoader(v);
    J && (v = new l.CDNFileAssetLoader(), G.addLoader(v));
    return new Promise(function(A) {
      let H = null;
      aa = {total:0, loaded:0, ready:function() {
        A(H);
      },};
      H = K(q, G);
      0 == aa.total && A(H);
    });
  };
  let td = l.RendererWrapper.prototype.align;
  l.RendererWrapper.prototype.align = function(q, v, J, G, A = 1.0) {
    td.call(this, q, v, J, G, A);
  };
  d = new ja();
  l.requestAnimationFrame = d.requestAnimationFrame.bind(d);
  l.cancelAnimationFrame = d.cancelAnimationFrame.bind(d);
  l.enableFPSCounter = d.Pb.bind(d);
  l.disableFPSCounter = d.Mb;
  d.ob = c;
  l.resolveAnimationFrame = c;
  l.cleanup = function() {
    w && w.delete();
  };
};
var pa = Object.assign({}, l), ta = "./this.program", ua = "", va, wa;
if (fa || ia) {
  ia ? ua = self.location.href : "undefined" != typeof document && document.currentScript && (ua = document.currentScript.src), _scriptName && (ua = _scriptName), ua.startsWith("blob:") ? ua = "" : ua = ua.substr(0, ua.replace(/[?#].*/, "").lastIndexOf("/") + 1), ia && (wa = a => {
    var b = new XMLHttpRequest();
    b.open("GET", a, !1);
    b.responseType = "arraybuffer";
    b.send(null);
    return new Uint8Array(b.response);
  }), va = (a, b, c) => {
    if (xa(a)) {
      var d = new XMLHttpRequest();
      d.open("GET", a, !0);
      d.responseType = "arraybuffer";
      d.onload = () => {
        200 == d.status || 0 == d.status && d.response ? b(d.response) : c();
      };
      d.onerror = c;
      d.send(null);
    } else {
      fetch(a, {credentials:"same-origin"}).then(e => e.ok ? e.arrayBuffer() : Promise.reject(Error(e.status + " : " + e.url))).then(b, c);
    }
  };
}
var Aa = l.print || console.log.bind(console), Ba = l.printErr || console.error.bind(console);
Object.assign(l, pa);
pa = null;
l.thisProgram && (ta = l.thisProgram);
var Ca;
l.wasmBinary && (Ca = l.wasmBinary);
var Da, Ea = !1, z, B, Fa, Ia, C, F, Ja, Ka;
function La() {
  var a = Da.buffer;
  l.HEAP8 = z = new Int8Array(a);
  l.HEAP16 = Fa = new Int16Array(a);
  l.HEAPU8 = B = new Uint8Array(a);
  l.HEAPU16 = Ia = new Uint16Array(a);
  l.HEAP32 = C = new Int32Array(a);
  l.HEAPU32 = F = new Uint32Array(a);
  l.HEAPF32 = Ja = new Float32Array(a);
  l.HEAPF64 = Ka = new Float64Array(a);
}
var Ma = [], Na = [], Oa = [];
function Pa() {
  var a = l.preRun.shift();
  Ma.unshift(a);
}
var Qa = 0, Ra = null, Sa = null;
function Ta(a) {
  l.onAbort?.(a);
  a = "Aborted(" + a + ")";
  Ba(a);
  Ea = !0;
  a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info.");
  da(a);
  throw a;
}
var Ua = a => a.startsWith("data:application/octet-stream;base64,"), xa = a => a.startsWith("file://"), Va;
function Wa(a) {
  if (a == Va && Ca) {
    return new Uint8Array(Ca);
  }
  if (wa) {
    return wa(a);
  }
  throw "both async and sync fetching of the wasm failed";
}
function Xa(a) {
  return Ca ? Promise.resolve().then(() => Wa(a)) : new Promise((b, c) => {
    va(a, d => b(new Uint8Array(d)), () => {
      try {
        b(Wa(a));
      } catch (d) {
        c(d);
      }
    });
  });
}
function Ya(a, b, c) {
  return Xa(a).then(d => WebAssembly.instantiate(d, b)).then(c, d => {
    Ba(`failed to asynchronously prepare wasm: ${d}`);
    Ta(d);
  });
}
function Za(a, b) {
  var c = Va;
  return Ca || "function" != typeof WebAssembly.instantiateStreaming || Ua(c) || xa(c) || "function" != typeof fetch ? Ya(c, a, b) : fetch(c, {credentials:"same-origin"}).then(d => WebAssembly.instantiateStreaming(d, a).then(b, function(e) {
    Ba(`wasm streaming compile failed: ${e}`);
    Ba("falling back to ArrayBuffer instantiation");
    return Ya(c, a, b);
  }));
}
var $a, ab, eb = {485789:(a, b, c, d, e) => {
  if ("undefined" === typeof window || void 0 === (window.AudioContext || window.webkitAudioContext)) {
    return 0;
  }
  if ("undefined" === typeof window.h) {
    window.h = {za:0};
    window.h.J = {};
    window.h.J.xa = a;
    window.h.J.capture = b;
    window.h.J.Ka = c;
    window.h.ga = {};
    window.h.ga.stopped = d;
    window.h.ga.wb = e;
    let f = window.h;
    f.D = [];
    f.tc = function(g) {
      for (var k = 0; k < f.D.length; ++k) {
        if (null == f.D[k]) {
          return f.D[k] = g, k;
        }
      }
      f.D.push(g);
      return f.D.length - 1;
    };
    f.Ab = function(g) {
      for (f.D[g] = null; 0 < f.D.length;) {
        if (null == f.D[f.D.length - 1]) {
          f.D.pop();
        } else {
          break;
        }
      }
    };
    f.Wc = function(g) {
      for (var k = 0; k < f.D.length; ++k) {
        if (f.D[k] == g) {
          return f.Ab(k);
        }
      }
    };
    f.qa = function(g) {
      return f.D[g];
    };
    f.Sa = ["touchend", "click"];
    f.unlock = function() {
      for (var g = 0; g < f.D.length; ++g) {
        var k = f.D[g];
        null != k && null != k.L && k.state === f.ga.wb && k.L.resume().then(() => {
          bb(k.pb);
        }, p => {
          console.error("Failed to resume audiocontext", p);
        });
      }
      f.Sa.map(function(p) {
        document.removeEventListener(p, f.unlock, !0);
      });
    };
    f.Sa.map(function(g) {
      document.addEventListener(g, f.unlock, !0);
    });
  }
  window.h.za += 1;
  return 1;
}, 487967:() => {
  "undefined" !== typeof window.h && (window.h.Sa.map(function(a) {
    document.removeEventListener(a, window.h.unlock, !0);
  }), --window.h.za, 0 === window.h.za && delete window.h);
}, 488271:() => void 0 !== navigator.mediaDevices && void 0 !== navigator.mediaDevices.getUserMedia, 488375:() => {
  try {
    var a = new (window.AudioContext || window.webkitAudioContext)(), b = a.sampleRate;
    a.close();
    return b;
  } catch (c) {
    return 0;
  }
}, 488546:(a, b, c, d, e, f) => {
  if ("undefined" === typeof window.h) {
    return -1;
  }
  var g = {}, k = {};
  a == window.h.J.xa && 0 != c && (k.sampleRate = c);
  g.L = new (window.AudioContext || window.webkitAudioContext)(k);
  g.L.suspend();
  g.state = window.h.ga.stopped;
  c = 0;
  a != window.h.J.xa && (c = b);
  g.Z = g.L.createScriptProcessor(d, c, b);
  g.Z.onaudioprocess = function(p) {
    if (null == g.ra || 0 == g.ra.length) {
      g.ra = new Float32Array(Ja.buffer, e, d * b);
    }
    if (a == window.h.J.capture || a == window.h.J.Ka) {
      for (var n = 0; n < b; n += 1) {
        for (var t = p.inputBuffer.getChannelData(n), x = g.ra, y = 0; y < d; y += 1) {
          x[y * b + n] = t[y];
        }
      }
      cb(f, d, e);
    }
    if (a == window.h.J.xa || a == window.h.J.Ka) {
      for (db(f, d, e), n = 0; n < p.outputBuffer.numberOfChannels; ++n) {
        for (t = p.outputBuffer.getChannelData(n), x = g.ra, y = 0; y < d; y += 1) {
          t[y] = x[y * b + n];
        }
      }
    } else {
      for (n = 0; n < p.outputBuffer.numberOfChannels; ++n) {
        p.outputBuffer.getChannelData(n).fill(0.0);
      }
    }
  };
  a != window.h.J.capture && a != window.h.J.Ka || navigator.mediaDevices.getUserMedia({audio:!0, video:!1}).then(function(p) {
    g.Ca = g.L.createMediaStreamSource(p);
    g.Ca.connect(g.Z);
    g.Z.connect(g.L.destination);
  }).catch(function(p) {
    console.log("Failed to get user media: " + p);
  });
  a == window.h.J.xa && g.Z.connect(g.L.destination);
  g.pb = f;
  return window.h.tc(g);
}, 491423:a => window.h.qa(a).L.sampleRate, 491496:a => {
  a = window.h.qa(a);
  void 0 !== a.Z && (a.Z.onaudioprocess = function() {
  }, a.Z.disconnect(), a.Z = void 0);
  void 0 !== a.Ca && (a.Ca.disconnect(), a.Ca = void 0);
  a.L.close();
  a.L = void 0;
  a.pb = void 0;
}, 491896:a => {
  window.h.Ab(a);
}, 491946:a => {
  a = window.h.qa(a);
  a.L.resume();
  a.state = window.h.ga.wb;
}, 492085:a => {
  a = window.h.qa(a);
  a.L.suspend();
  a.state = window.h.ga.stopped;
}}, fb = a => {
  for (; 0 < a.length;) {
    a.shift()(l);
  }
};
function gb() {
  var a = C[+hb >> 2];
  hb += 4;
  return a;
}
var ib = (a, b) => {
  for (var c = 0, d = a.length - 1; 0 <= d; d--) {
    var e = a[d];
    "." === e ? a.splice(d, 1) : ".." === e ? (a.splice(d, 1), c++) : c && (a.splice(d, 1), c--);
  }
  if (b) {
    for (; c; c--) {
      a.unshift("..");
    }
  }
  return a;
}, jb = a => {
  var b = "/" === a.charAt(0), c = "/" === a.substr(-1);
  (a = ib(a.split("/").filter(d => !!d), !b).join("/")) || b || (a = ".");
  a && c && (a += "/");
  return (b ? "/" : "") + a;
}, kb = a => {
  var b = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(a).slice(1);
  a = b[0];
  b = b[1];
  if (!a && !b) {
    return ".";
  }
  b &&= b.substr(0, b.length - 1);
  return a + b;
}, lb = a => {
  if ("/" === a) {
    return "/";
  }
  a = jb(a);
  a = a.replace(/\/$/, "");
  var b = a.lastIndexOf("/");
  return -1 === b ? a : a.substr(b + 1);
}, mb = () => {
  if ("object" == typeof crypto && "function" == typeof crypto.getRandomValues) {
    return a => crypto.getRandomValues(a);
  }
  Ta("initRandomDevice");
}, nb = a => (nb = mb())(a), ob = (...a) => {
  for (var b = "", c = !1, d = a.length - 1; -1 <= d && !c; d--) {
    c = 0 <= d ? a[d] : "/";
    if ("string" != typeof c) {
      throw new TypeError("Arguments to path.resolve must be strings");
    }
    if (!c) {
      return "";
    }
    b = c + "/" + b;
    c = "/" === c.charAt(0);
  }
  b = ib(b.split("/").filter(e => !!e), !c).join("/");
  return (c ? "/" : "") + b || ".";
}, pb = "undefined" != typeof TextDecoder ? new TextDecoder("utf8") : void 0, qb = (a, b, c) => {
  var d = b + c;
  for (c = b; a[c] && !(c >= d);) {
    ++c;
  }
  if (16 < c - b && a.buffer && pb) {
    return pb.decode(a.subarray(b, c));
  }
  for (d = ""; b < c;) {
    var e = a[b++];
    if (e & 128) {
      var f = a[b++] & 63;
      if (192 == (e & 224)) {
        d += String.fromCharCode((e & 31) << 6 | f);
      } else {
        var g = a[b++] & 63;
        e = 224 == (e & 240) ? (e & 15) << 12 | f << 6 | g : (e & 7) << 18 | f << 12 | g << 6 | a[b++] & 63;
        65536 > e ? d += String.fromCharCode(e) : (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023));
      }
    } else {
      d += String.fromCharCode(e);
    }
  }
  return d;
}, rb = [], sb = a => {
  for (var b = 0, c = 0; c < a.length; ++c) {
    var d = a.charCodeAt(c);
    127 >= d ? b++ : 2047 >= d ? b += 2 : 55296 <= d && 57343 >= d ? (b += 4, ++c) : b += 3;
  }
  return b;
}, ub = (a, b, c, d) => {
  if (!(0 < d)) {
    return 0;
  }
  var e = c;
  d = c + d - 1;
  for (var f = 0; f < a.length; ++f) {
    var g = a.charCodeAt(f);
    if (55296 <= g && 57343 >= g) {
      var k = a.charCodeAt(++f);
      g = 65536 + ((g & 1023) << 10) | k & 1023;
    }
    if (127 >= g) {
      if (c >= d) {
        break;
      }
      b[c++] = g;
    } else {
      if (2047 >= g) {
        if (c + 1 >= d) {
          break;
        }
        b[c++] = 192 | g >> 6;
      } else {
        if (65535 >= g) {
          if (c + 2 >= d) {
            break;
          }
          b[c++] = 224 | g >> 12;
        } else {
          if (c + 3 >= d) {
            break;
          }
          b[c++] = 240 | g >> 18;
          b[c++] = 128 | g >> 12 & 63;
        }
        b[c++] = 128 | g >> 6 & 63;
      }
      b[c++] = 128 | g & 63;
    }
  }
  b[c] = 0;
  return c - e;
};
function vb(a, b) {
  var c = Array(sb(a) + 1);
  a = ub(a, c, 0, c.length);
  b && (c.length = a);
  return c;
}
var wb = [];
function xb(a, b) {
  wb[a] = {input:[], H:[], W:b};
  yb(a, zb);
}
var zb = {open(a) {
  var b = wb[a.node.ya];
  if (!b) {
    throw new N(43);
  }
  a.s = b;
  a.seekable = !1;
}, close(a) {
  a.s.W.pa(a.s);
}, pa(a) {
  a.s.W.pa(a.s);
}, read(a, b, c, d) {
  if (!a.s || !a.s.W.ib) {
    throw new N(60);
  }
  for (var e = 0, f = 0; f < d; f++) {
    try {
      var g = a.s.W.ib(a.s);
    } catch (k) {
      throw new N(29);
    }
    if (void 0 === g && 0 === e) {
      throw new N(6);
    }
    if (null === g || void 0 === g) {
      break;
    }
    e++;
    b[c + f] = g;
  }
  e && (a.node.timestamp = Date.now());
  return e;
}, write(a, b, c, d) {
  if (!a.s || !a.s.W.Na) {
    throw new N(60);
  }
  try {
    for (var e = 0; e < d; e++) {
      a.s.W.Na(a.s, b[c + e]);
    }
  } catch (f) {
    throw new N(29);
  }
  d && (a.node.timestamp = Date.now());
  return e;
},}, Ab = {ib() {
  a: {
    if (!rb.length) {
      var a = null;
      "undefined" != typeof window && "function" == typeof window.prompt && (a = window.prompt("Input: "), null !== a && (a += "\n"));
      if (!a) {
        a = null;
        break a;
      }
      rb = vb(a, !0);
    }
    a = rb.shift();
  }
  return a;
}, Na(a, b) {
  null === b || 10 === b ? (Aa(qb(a.H, 0)), a.H = []) : 0 != b && a.H.push(b);
}, pa(a) {
  a.H && 0 < a.H.length && (Aa(qb(a.H, 0)), a.H = []);
}, Zb() {
  return {Fc:25856, Hc:5, Ec:191, Gc:35387, Dc:[3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,]};
}, $b() {
  return 0;
}, ac() {
  return [24, 80];
},}, Bb = {Na(a, b) {
  null === b || 10 === b ? (Ba(qb(a.H, 0)), a.H = []) : 0 != b && a.H.push(b);
}, pa(a) {
  a.H && 0 < a.H.length && (Ba(qb(a.H, 0)), a.H = []);
},};
function Cb(a, b) {
  var c = a.l ? a.l.length : 0;
  c >= b || (b = Math.max(b, c * (1048576 > c ? 2.0 : 1.125) >>> 0), 0 != c && (b = Math.max(b, 256)), c = a.l, a.l = new Uint8Array(b), 0 < a.v && a.l.set(c.subarray(0, a.v), 0));
}
var O = {O:null, V() {
  return O.createNode(null, "/", 16895, 0);
}, createNode(a, b, c, d) {
  if (24576 === (c & 61440) || 4096 === (c & 61440)) {
    throw new N(63);
  }
  O.O || (O.O = {dir:{node:{Y:O.j.Y, R:O.j.R, ka:O.j.ka, ua:O.j.ua, tb:O.j.tb, zb:O.j.zb, ub:O.j.ub, sb:O.j.sb, Da:O.j.Da}, stream:{ba:O.m.ba}}, file:{node:{Y:O.j.Y, R:O.j.R}, stream:{ba:O.m.ba, read:O.m.read, write:O.m.write, Ya:O.m.Ya, lb:O.m.lb, nb:O.m.nb}}, link:{node:{Y:O.j.Y, R:O.j.R, ma:O.j.ma}, stream:{}}, ab:{node:{Y:O.j.Y, R:O.j.R}, stream:Db}});
  c = Eb(a, b, c, d);
  16384 === (c.mode & 61440) ? (c.j = O.O.dir.node, c.m = O.O.dir.stream, c.l = {}) : 32768 === (c.mode & 61440) ? (c.j = O.O.file.node, c.m = O.O.file.stream, c.v = 0, c.l = null) : 40960 === (c.mode & 61440) ? (c.j = O.O.link.node, c.m = O.O.link.stream) : 8192 === (c.mode & 61440) && (c.j = O.O.ab.node, c.m = O.O.ab.stream);
  c.timestamp = Date.now();
  a && (a.l[b] = c, a.timestamp = c.timestamp);
  return c;
}, Lc(a) {
  return a.l ? a.l.subarray ? a.l.subarray(0, a.v) : new Uint8Array(a.l) : new Uint8Array(0);
}, j:{Y(a) {
  var b = {};
  b.Jc = 8192 === (a.mode & 61440) ? a.id : 1;
  b.Nc = a.id;
  b.mode = a.mode;
  b.Rc = 1;
  b.uid = 0;
  b.Mc = 0;
  b.ya = a.ya;
  16384 === (a.mode & 61440) ? b.size = 4096 : 32768 === (a.mode & 61440) ? b.size = a.v : 40960 === (a.mode & 61440) ? b.size = a.link.length : b.size = 0;
  b.Bc = new Date(a.timestamp);
  b.Qc = new Date(a.timestamp);
  b.Ic = new Date(a.timestamp);
  b.Ib = 4096;
  b.Cc = Math.ceil(b.size / b.Ib);
  return b;
}, R(a, b) {
  void 0 !== b.mode && (a.mode = b.mode);
  void 0 !== b.timestamp && (a.timestamp = b.timestamp);
  if (void 0 !== b.size && (b = b.size, a.v != b)) {
    if (0 == b) {
      a.l = null, a.v = 0;
    } else {
      var c = a.l;
      a.l = new Uint8Array(b);
      c && a.l.set(c.subarray(0, Math.min(b, a.v)));
      a.v = b;
    }
  }
}, ka() {
  throw Fb[44];
}, ua(a, b, c, d) {
  return O.createNode(a, b, c, d);
}, tb(a, b, c) {
  if (16384 === (a.mode & 61440)) {
    try {
      var d = Gb(b, c);
    } catch (f) {
    }
    if (d) {
      for (var e in d.l) {
        throw new N(55);
      }
    }
  }
  delete a.parent.l[a.name];
  a.parent.timestamp = Date.now();
  a.name = c;
  b.l[c] = a;
  b.timestamp = a.parent.timestamp;
}, zb(a, b) {
  delete a.l[b];
  a.timestamp = Date.now();
}, ub(a, b) {
  var c = Gb(a, b), d;
  for (d in c.l) {
    throw new N(55);
  }
  delete a.l[b];
  a.timestamp = Date.now();
}, sb(a) {
  var b = [".", ".."], c;
  for (c of Object.keys(a.l)) {
    b.push(c);
  }
  return b;
}, Da(a, b, c) {
  a = O.createNode(a, b, 41471, 0);
  a.link = c;
  return a;
}, ma(a) {
  if (40960 !== (a.mode & 61440)) {
    throw new N(28);
  }
  return a.link;
},}, m:{read(a, b, c, d, e) {
  var f = a.node.l;
  if (e >= a.node.v) {
    return 0;
  }
  a = Math.min(a.node.v - e, d);
  if (8 < a && f.subarray) {
    b.set(f.subarray(e, e + a), c);
  } else {
    for (d = 0; d < a; d++) {
      b[c + d] = f[e + d];
    }
  }
  return a;
}, write(a, b, c, d, e, f) {
  b.buffer === z.buffer && (f = !1);
  if (!d) {
    return 0;
  }
  a = a.node;
  a.timestamp = Date.now();
  if (b.subarray && (!a.l || a.l.subarray)) {
    if (f) {
      return a.l = b.subarray(c, c + d), a.v = d;
    }
    if (0 === a.v && 0 === e) {
      return a.l = b.slice(c, c + d), a.v = d;
    }
    if (e + d <= a.v) {
      return a.l.set(b.subarray(c, c + d), e), d;
    }
  }
  Cb(a, e + d);
  if (a.l.subarray && b.subarray) {
    a.l.set(b.subarray(c, c + d), e);
  } else {
    for (f = 0; f < d; f++) {
      a.l[e + f] = b[c + f];
    }
  }
  a.v = Math.max(a.v, e + d);
  return d;
}, ba(a, b, c) {
  1 === c ? b += a.position : 2 === c && 32768 === (a.node.mode & 61440) && (b += a.node.v);
  if (0 > b) {
    throw new N(28);
  }
  return b;
}, Ya(a, b, c) {
  Cb(a.node, b + c);
  a.node.v = Math.max(a.node.v, b + c);
}, lb(a, b, c, d, e) {
  if (32768 !== (a.node.mode & 61440)) {
    throw new N(43);
  }
  a = a.node.l;
  if (e & 2 || a.buffer !== z.buffer) {
    if (0 < c || c + b < a.length) {
      a.subarray ? a = a.subarray(c, c + b) : a = Array.prototype.slice.call(a, c, c + b);
    }
    c = !0;
    Ta();
    b = void 0;
    if (!b) {
      throw new N(48);
    }
    z.set(a, b);
  } else {
    c = !1, b = a.byteOffset;
  }
  return {o:b, Ac:c};
}, nb(a, b, c, d) {
  O.m.write(a, b, 0, d, c, !1);
  return 0;
},},}, Hb = (a, b) => {
  var c = 0;
  a && (c |= 365);
  b && (c |= 146);
  return c;
}, Ib = null, Jb = {}, Kb = [], Lb = 1, Mb = null, Nb = !0, N = class {
  constructor(a) {
    this.name = "ErrnoError";
    this.aa = a;
  }
}, Fb = {}, Ob = class {
  constructor() {
    this.h = {};
    this.node = null;
  }
  get flags() {
    return this.h.flags;
  }
  set flags(a) {
    this.h.flags = a;
  }
  get position() {
    return this.h.position;
  }
  set position(a) {
    this.h.position = a;
  }
}, Pb = class {
  constructor(a, b, c, d) {
    a ||= this;
    this.parent = a;
    this.V = a.V;
    this.va = null;
    this.id = Lb++;
    this.name = b;
    this.mode = c;
    this.j = {};
    this.m = {};
    this.ya = d;
  }
  get read() {
    return 365 === (this.mode & 365);
  }
  set read(a) {
    a ? this.mode |= 365 : this.mode &= -366;
  }
  get write() {
    return 146 === (this.mode & 146);
  }
  set write(a) {
    a ? this.mode |= 146 : this.mode &= -147;
  }
};
function Qb(a, b = {}) {
  a = ob(a);
  if (!a) {
    return {path:"", node:null};
  }
  b = Object.assign({hb:!0, Pa:0}, b);
  if (8 < b.Pa) {
    throw new N(32);
  }
  a = a.split("/").filter(g => !!g);
  for (var c = Ib, d = "/", e = 0; e < a.length; e++) {
    var f = e === a.length - 1;
    if (f && b.parent) {
      break;
    }
    c = Gb(c, a[e]);
    d = jb(d + "/" + a[e]);
    c.va && (!f || f && b.hb) && (c = c.va.root);
    if (!f || b.gb) {
      for (f = 0; 40960 === (c.mode & 61440);) {
        if (c = Rb(d), d = ob(kb(d), c), c = Qb(d, {Pa:b.Pa + 1}).node, 40 < f++) {
          throw new N(32);
        }
      }
    }
  }
  return {path:d, node:c};
}
function Sb(a) {
  for (var b;;) {
    if (a === a.parent) {
      return a = a.V.mb, b ? "/" !== a[a.length - 1] ? `${a}/${b}` : a + b : a;
    }
    b = b ? `${a.name}/${b}` : a.name;
    a = a.parent;
  }
}
function Tb(a, b) {
  for (var c = 0, d = 0; d < b.length; d++) {
    c = (c << 5) - c + b.charCodeAt(d) | 0;
  }
  return (a + c >>> 0) % Mb.length;
}
function Gb(a, b) {
  var c = 16384 === (a.mode & 61440) ? (c = Ub(a, "x")) ? c : a.j.ka ? 0 : 2 : 54;
  if (c) {
    throw new N(c);
  }
  for (c = Mb[Tb(a.id, b)]; c; c = c.hc) {
    var d = c.name;
    if (c.parent.id === a.id && d === b) {
      return c;
    }
  }
  return a.j.ka(a, b);
}
function Eb(a, b, c, d) {
  a = new Pb(a, b, c, d);
  b = Tb(a.parent.id, a.name);
  a.hc = Mb[b];
  return Mb[b] = a;
}
function Vb(a) {
  var b = ["r", "w", "rw"][a & 3];
  a & 512 && (b += "w");
  return b;
}
function Ub(a, b) {
  if (Nb) {
    return 0;
  }
  if (!b.includes("r") || a.mode & 292) {
    if (b.includes("w") && !(a.mode & 146) || b.includes("x") && !(a.mode & 73)) {
      return 2;
    }
  } else {
    return 2;
  }
  return 0;
}
function Wb(a, b) {
  try {
    return Gb(a, b), 20;
  } catch (c) {
  }
  return Ub(a, "wx");
}
function Xb(a) {
  a = Kb[a];
  if (!a) {
    throw new N(8);
  }
  return a;
}
function Yb(a, b = -1) {
  a = Object.assign(new Ob(), a);
  if (-1 == b) {
    a: {
      for (b = 0; 4096 >= b; b++) {
        if (!Kb[b]) {
          break a;
        }
      }
      throw new N(33);
    }
  }
  a.X = b;
  return Kb[b] = a;
}
function Zb(a, b = -1) {
  a = Yb(a, b);
  a.m?.Kc?.(a);
  return a;
}
var Db = {open(a) {
  a.m = Jb[a.node.ya].m;
  a.m.open?.(a);
}, ba() {
  throw new N(70);
},};
function yb(a, b) {
  Jb[a] = {m:b};
}
function $b(a, b) {
  var c = "/" === b;
  if (c && Ib) {
    throw new N(10);
  }
  if (!c && b) {
    var d = Qb(b, {hb:!1});
    b = d.path;
    d = d.node;
    if (d.va) {
      throw new N(10);
    }
    if (16384 !== (d.mode & 61440)) {
      throw new N(54);
    }
  }
  b = {type:a, Tc:{}, mb:b, fc:[]};
  a = a.V(b);
  a.V = b;
  b.root = a;
  c ? Ib = a : d && (d.va = b, d.V && d.V.fc.push(b));
}
function fc(a, b, c) {
  var d = Qb(a, {parent:!0}).node;
  a = lb(a);
  if (!a || "." === a || ".." === a) {
    throw new N(28);
  }
  var e = Wb(d, a);
  if (e) {
    throw new N(e);
  }
  if (!d.j.ua) {
    throw new N(63);
  }
  return d.j.ua(d, a, b, c);
}
function gc(a) {
  return fc(a, 16895, 0);
}
function hc(a, b, c) {
  "undefined" == typeof c && (c = b, b = 438);
  fc(a, b | 8192, c);
}
function ic(a, b) {
  if (!ob(a)) {
    throw new N(44);
  }
  var c = Qb(b, {parent:!0}).node;
  if (!c) {
    throw new N(44);
  }
  b = lb(b);
  var d = Wb(c, b);
  if (d) {
    throw new N(d);
  }
  if (!c.j.Da) {
    throw new N(63);
  }
  c.j.Da(c, b, a);
}
function Rb(a) {
  a = Qb(a).node;
  if (!a) {
    throw new N(44);
  }
  if (!a.j.ma) {
    throw new N(28);
  }
  return ob(Sb(a.parent), a.j.ma(a));
}
function jc(a, b, c) {
  if ("" === a) {
    throw new N(44);
  }
  if ("string" == typeof b) {
    var d = {r:0, "r+":2, w:577, "w+":578, a:1089, "a+":1090,}[b];
    if ("undefined" == typeof d) {
      throw Error(`Unknown file open mode: ${b}`);
    }
    b = d;
  }
  c = b & 64 ? ("undefined" == typeof c ? 438 : c) & 4095 | 32768 : 0;
  if ("object" == typeof a) {
    var e = a;
  } else {
    a = jb(a);
    try {
      e = Qb(a, {gb:!(b & 131072)}).node;
    } catch (f) {
    }
  }
  d = !1;
  if (b & 64) {
    if (e) {
      if (b & 128) {
        throw new N(20);
      }
    } else {
      e = fc(a, c, 0), d = !0;
    }
  }
  if (!e) {
    throw new N(44);
  }
  8192 === (e.mode & 61440) && (b &= -513);
  if (b & 65536 && 16384 !== (e.mode & 61440)) {
    throw new N(54);
  }
  if (!d && (c = e ? 40960 === (e.mode & 61440) ? 32 : 16384 === (e.mode & 61440) && ("r" !== Vb(b) || b & 512) ? 31 : Ub(e, Vb(b)) : 44)) {
    throw new N(c);
  }
  if (b & 512 && !d) {
    c = e;
    c = "string" == typeof c ? Qb(c, {gb:!0}).node : c;
    if (!c.j.R) {
      throw new N(63);
    }
    if (16384 === (c.mode & 61440)) {
      throw new N(31);
    }
    if (32768 !== (c.mode & 61440)) {
      throw new N(28);
    }
    if (d = Ub(c, "w")) {
      throw new N(d);
    }
    c.j.R(c, {size:0, timestamp:Date.now()});
  }
  b &= -131713;
  e = Yb({node:e, path:Sb(e), flags:b, seekable:!0, position:0, m:e.m, uc:[], error:!1});
  e.m.open && e.m.open(e);
  !l.logReadFiles || b & 1 || (kc ||= {}, a in kc || (kc[a] = 1));
  return e;
}
function lc(a, b, c) {
  if (null === a.X) {
    throw new N(8);
  }
  if (!a.seekable || !a.m.ba) {
    throw new N(70);
  }
  if (0 != c && 1 != c && 2 != c) {
    throw new N(28);
  }
  a.position = a.m.ba(a, b, c);
  a.uc = [];
}
var mc;
function nc(a, b, c) {
  a = jb("/dev/" + a);
  var d = Hb(!!b, !!c);
  oc ||= 64;
  var e = oc++ << 8 | 0;
  yb(e, {open(f) {
    f.seekable = !1;
  }, close() {
    c?.buffer?.length && c(10);
  }, read(f, g, k, p) {
    for (var n = 0, t = 0; t < p; t++) {
      try {
        var x = b();
      } catch (y) {
        throw new N(29);
      }
      if (void 0 === x && 0 === n) {
        throw new N(6);
      }
      if (null === x || void 0 === x) {
        break;
      }
      n++;
      g[k + t] = x;
    }
    n && (f.node.timestamp = Date.now());
    return n;
  }, write(f, g, k, p) {
    for (var n = 0; n < p; n++) {
      try {
        c(g[k + n]);
      } catch (t) {
        throw new N(29);
      }
    }
    p && (f.node.timestamp = Date.now());
    return n;
  }});
  hc(a, d, e);
}
var oc, pc = {}, kc, hb = void 0, qc = (a, b) => Object.defineProperty(b, "name", {value:a}), rc = [], sc = [], P, Q = a => {
  if (!a) {
    throw new P("Cannot use deleted val. handle = " + a);
  }
  return sc[a];
}, tc = a => {
  switch(a) {
    case void 0:
      return 2;
    case null:
      return 4;
    case !0:
      return 6;
    case !1:
      return 8;
    default:
      const b = rc.pop() || sc.length;
      sc[b] = a;
      sc[b + 1] = 1;
      return b;
  }
}, uc = a => {
  var b = Error, c = qc(a, function(d) {
    this.name = a;
    this.message = d;
    d = Error(d).stack;
    void 0 !== d && (this.stack = this.toString() + "\n" + d.replace(/^Error(:[^\n]*)?\n/, ""));
  });
  c.prototype = Object.create(b.prototype);
  c.prototype.constructor = c;
  c.prototype.toString = function() {
    return void 0 === this.message ? this.name : `${this.name}: ${this.message}`;
  };
  return c;
}, vc, wc, S = a => {
  for (var b = ""; B[a];) {
    b += wc[B[a++]];
  }
  return b;
}, xc = [], yc = () => {
  for (; xc.length;) {
    var a = xc.pop();
    a.g.fa = !1;
    a["delete"]();
  }
}, zc, Ac = {}, Bc = (a, b) => {
  if (void 0 === b) {
    throw new P("ptr should not be undefined");
  }
  for (; a.C;) {
    b = a.na(b), a = a.C;
  }
  return b;
}, Cc = {}, Fc = a => {
  a = Dc(a);
  var b = S(a);
  Ec(a);
  return b;
}, Gc = (a, b) => {
  var c = Cc[a];
  if (void 0 === c) {
    throw a = `${b} has unknown type ${Fc(a)}`, new P(a);
  }
  return c;
}, Hc = () => {
}, Ic = !1, Jc = (a, b, c) => {
  if (b === c) {
    return a;
  }
  if (void 0 === c.C) {
    return null;
  }
  a = Jc(a, b, c.C);
  return null === a ? null : c.Nb(a);
}, Kc = {}, Lc = (a, b) => {
  b = Bc(a, b);
  return Ac[b];
}, Mc, Oc = (a, b) => {
  if (!b.u || !b.o) {
    throw new Mc("makeClassHandle requires ptr and ptrType");
  }
  if (!!b.K !== !!b.F) {
    throw new Mc("Both smartPtrType and smartPtr must be specified");
  }
  b.count = {value:1};
  return Nc(Object.create(a, {g:{value:b, writable:!0,},}));
}, Nc = a => {
  if ("undefined" === typeof FinalizationRegistry) {
    return Nc = b => b, a;
  }
  Ic = new FinalizationRegistry(b => {
    b = b.g;
    --b.count.value;
    0 === b.count.value && (b.F ? b.K.P(b.F) : b.u.i.P(b.o));
  });
  Nc = b => {
    var c = b.g;
    c.F && Ic.register(b, {g:c}, b);
    return b;
  };
  Hc = b => {
    Ic.unregister(b);
  };
  return Nc(a);
}, Pc = {}, Qc = a => {
  for (; a.length;) {
    var b = a.pop();
    a.pop()(b);
  }
};
function Rc(a) {
  return this.fromWireType(F[a >> 2]);
}
var Sc = {}, Tc = {}, U = (a, b, c) => {
  function d(k) {
    k = c(k);
    if (k.length !== a.length) {
      throw new Mc("Mismatched type converter count");
    }
    for (var p = 0; p < a.length; ++p) {
      Uc(a[p], k[p]);
    }
  }
  a.forEach(function(k) {
    Tc[k] = b;
  });
  var e = Array(b.length), f = [], g = 0;
  b.forEach((k, p) => {
    Cc.hasOwnProperty(k) ? e[p] = Cc[k] : (f.push(k), Sc.hasOwnProperty(k) || (Sc[k] = []), Sc[k].push(() => {
      e[p] = Cc[k];
      ++g;
      g === f.length && d(e);
    }));
  });
  0 === f.length && d(e);
};
function Vc(a, b, c = {}) {
  var d = b.name;
  if (!a) {
    throw new P(`type "${d}" must have a positive integer typeid pointer`);
  }
  if (Cc.hasOwnProperty(a)) {
    if (c.Xb) {
      return;
    }
    throw new P(`Cannot register type '${d}' twice`);
  }
  Cc[a] = b;
  delete Tc[a];
  Sc.hasOwnProperty(a) && (b = Sc[a], delete Sc[a], b.forEach(e => e()));
}
function Uc(a, b, c = {}) {
  if (!("argPackAdvance" in b)) {
    throw new TypeError("registerType registeredInstance requires argPackAdvance");
  }
  return Vc(a, b, c);
}
var Wc = a => {
  throw new P(a.g.u.i.name + " instance already deleted");
};
function Xc() {
}
var Yc = (a, b, c) => {
  if (void 0 === a[b].A) {
    var d = a[b];
    a[b] = function(...e) {
      if (!a[b].A.hasOwnProperty(e.length)) {
        throw new P(`Function '${c}' called with an invalid number of arguments (${e.length}) - expects one of (${a[b].A})!`);
      }
      return a[b].A[e.length].apply(this, e);
    };
    a[b].A = [];
    a[b].A[d.ea] = d;
  }
}, Zc = (a, b, c) => {
  if (l.hasOwnProperty(a)) {
    if (void 0 === c || void 0 !== l[a].A && void 0 !== l[a].A[c]) {
      throw new P(`Cannot register public name '${a}' twice`);
    }
    Yc(l, a, a);
    if (l.hasOwnProperty(c)) {
      throw new P(`Cannot register multiple overloads of a function with the same number of arguments (${c})!`);
    }
    l[a].A[c] = b;
  } else {
    l[a] = b, void 0 !== c && (l[a].Sc = c);
  }
}, $c = a => {
  if (void 0 === a) {
    return "_unknown";
  }
  a = a.replace(/[^a-zA-Z0-9_]/g, "$");
  var b = a.charCodeAt(0);
  return 48 <= b && 57 >= b ? `_${a}` : a;
};
function ad(a, b, c, d, e, f, g, k) {
  this.name = a;
  this.constructor = b;
  this.N = c;
  this.P = d;
  this.C = e;
  this.Sb = f;
  this.na = g;
  this.Nb = k;
  this.qb = [];
}
var bd = (a, b, c) => {
  for (; b !== c;) {
    if (!b.na) {
      throw new P(`Expected null or instance of ${c.name}, got an instance of ${b.name}`);
    }
    a = b.na(a);
    b = b.C;
  }
  return a;
};
function cd(a, b) {
  if (null === b) {
    if (this.Ma) {
      throw new P(`null is not a valid ${this.name}`);
    }
    return 0;
  }
  if (!b.g) {
    throw new P(`Cannot pass "${dd(b)}" as a ${this.name}`);
  }
  if (!b.g.o) {
    throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);
  }
  return bd(b.g.o, b.g.u.i, this.i);
}
function ed(a, b) {
  if (null === b) {
    if (this.Ma) {
      throw new P(`null is not a valid ${this.name}`);
    }
    if (this.ta) {
      var c = this.Oa();
      null !== a && a.push(this.P, c);
      return c;
    }
    return 0;
  }
  if (!b || !b.g) {
    throw new P(`Cannot pass "${dd(b)}" as a ${this.name}`);
  }
  if (!b.g.o) {
    throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);
  }
  if (!this.sa && b.g.u.sa) {
    throw new P(`Cannot convert argument of type ${b.g.K ? b.g.K.name : b.g.u.name} to parameter type ${this.name}`);
  }
  c = bd(b.g.o, b.g.u.i, this.i);
  if (this.ta) {
    if (void 0 === b.g.F) {
      throw new P("Passing raw pointer to smart pointer is illegal");
    }
    switch(this.oc) {
      case 0:
        if (b.g.K === this) {
          c = b.g.F;
        } else {
          throw new P(`Cannot convert argument of type ${b.g.K ? b.g.K.name : b.g.u.name} to parameter type ${this.name}`);
        }
        break;
      case 1:
        c = b.g.F;
        break;
      case 2:
        if (b.g.K === this) {
          c = b.g.F;
        } else {
          var d = b.clone();
          c = this.kc(c, tc(() => d["delete"]()));
          null !== a && a.push(this.P, c);
        }
        break;
      default:
        throw new P("Unsupporting sharing policy");
    }
  }
  return c;
}
function fd(a, b) {
  if (null === b) {
    if (this.Ma) {
      throw new P(`null is not a valid ${this.name}`);
    }
    return 0;
  }
  if (!b.g) {
    throw new P(`Cannot pass "${dd(b)}" as a ${this.name}`);
  }
  if (!b.g.o) {
    throw new P(`Cannot pass deleted object as a pointer of type ${this.name}`);
  }
  if (b.g.u.sa) {
    throw new P(`Cannot convert argument of type ${b.g.u.name} to parameter type ${this.name}`);
  }
  return bd(b.g.o, b.g.u.i, this.i);
}
function gd(a, b, c, d, e, f, g, k, p, n, t) {
  this.name = a;
  this.i = b;
  this.Ma = c;
  this.sa = d;
  this.ta = e;
  this.jc = f;
  this.oc = g;
  this.rb = k;
  this.Oa = p;
  this.kc = n;
  this.P = t;
  e || void 0 !== b.C ? this.toWireType = ed : (this.toWireType = d ? cd : fd, this.M = null);
}
var hd = (a, b, c) => {
  if (!l.hasOwnProperty(a)) {
    throw new Mc("Replacing nonexistent public symbol");
  }
  void 0 !== l[a].A && void 0 !== c ? l[a].A[c] = b : (l[a] = b, l[a].ea = c);
}, jd = [], kd, ld = a => {
  var b = jd[a];
  b || (a >= jd.length && (jd.length = a + 1), jd[a] = b = kd.get(a));
  return b;
}, md = (a, b, c = []) => {
  a.includes("j") ? (a = a.replace(/p/g, "i"), b = (0,l["dynCall_" + a])(b, ...c)) : b = ld(b)(...c);
  return b;
}, nd = (a, b) => (...c) => md(a, b, c), W = (a, b) => {
  a = S(a);
  var c = a.includes("j") ? nd(a, b) : ld(b);
  if ("function" != typeof c) {
    throw new P(`unknown function pointer with signature ${a}: ${b}`);
  }
  return c;
}, od, pd = (a, b) => {
  function c(f) {
    e[f] || Cc[f] || (Tc[f] ? Tc[f].forEach(c) : (d.push(f), e[f] = !0));
  }
  var d = [], e = {};
  b.forEach(c);
  throw new od(`${a}: ` + d.map(Fc).join([", "]));
};
function qd(a) {
  for (var b = 1; b < a.length; ++b) {
    if (null !== a[b] && void 0 === a[b].M) {
      return !0;
    }
  }
  return !1;
}
function ud(a, b, c, d, e) {
  var f = b.length;
  if (2 > f) {
    throw new P("argTypes array size mismatch! Must at least get return value and 'this' types!");
  }
  var g = null !== b[1] && null !== c, k = qd(b), p = "void" !== b[0].name, n = f - 2, t = Array(n), x = [], y = [];
  return qc(a, function(...m) {
    if (m.length !== n) {
      throw new P(`function ${a} called with ${m.length} arguments, expected ${n}`);
    }
    y.length = 0;
    x.length = g ? 2 : 1;
    x[0] = e;
    if (g) {
      var u = b[1].toWireType(y, this);
      x[1] = u;
    }
    for (var r = 0; r < n; ++r) {
      t[r] = b[r + 2].toWireType(y, m[r]), x.push(t[r]);
    }
    m = d(...x);
    if (k) {
      Qc(y);
    } else {
      for (r = g ? 1 : 2; r < b.length; r++) {
        var D = 1 === r ? u : t[r - 2];
        null !== b[r].M && b[r].M(D);
      }
    }
    u = p ? b[0].fromWireType(m) : void 0;
    return u;
  });
}
var vd = (a, b) => {
  for (var c = [], d = 0; d < a; d++) {
    c.push(F[b + 4 * d >> 2]);
  }
  return c;
}, wd = a => {
  a = a.trim();
  const b = a.indexOf("(");
  return -1 !== b ? a.substr(0, b) : a;
}, xd = (a, b, c) => {
  if (!(a instanceof Object)) {
    throw new P(`${c} with invalid "this": ${a}`);
  }
  if (!(a instanceof b.i.constructor)) {
    throw new P(`${c} incompatible with "this" of type ${a.constructor.name}`);
  }
  if (!a.g.o) {
    throw new P(`cannot call emscripten binding method ${c} on deleted object`);
  }
  return bd(a.g.o, a.g.u.i, b.i);
}, yd = a => {
  9 < a && 0 === --sc[a + 1] && (sc[a] = void 0, rc.push(a));
}, zd = {name:"emscripten::val", fromWireType:a => {
  var b = Q(a);
  yd(a);
  return b;
}, toWireType:(a, b) => tc(b), argPackAdvance:8, readValueFromPointer:Rc, M:null,}, Ad = (a, b, c) => {
  switch(b) {
    case 1:
      return c ? function(d) {
        return this.fromWireType(z[d]);
      } : function(d) {
        return this.fromWireType(B[d]);
      };
    case 2:
      return c ? function(d) {
        return this.fromWireType(Fa[d >> 1]);
      } : function(d) {
        return this.fromWireType(Ia[d >> 1]);
      };
    case 4:
      return c ? function(d) {
        return this.fromWireType(C[d >> 2]);
      } : function(d) {
        return this.fromWireType(F[d >> 2]);
      };
    default:
      throw new TypeError(`invalid integer width (${b}): ${a}`);
  }
}, dd = a => {
  if (null === a) {
    return "null";
  }
  var b = typeof a;
  return "object" === b || "array" === b || "function" === b ? a.toString() : "" + a;
}, Bd = (a, b) => {
  switch(b) {
    case 4:
      return function(c) {
        return this.fromWireType(Ja[c >> 2]);
      };
    case 8:
      return function(c) {
        return this.fromWireType(Ka[c >> 3]);
      };
    default:
      throw new TypeError(`invalid float width (${b}): ${a}`);
  }
}, Cd = (a, b, c) => {
  switch(b) {
    case 1:
      return c ? d => z[d] : d => B[d];
    case 2:
      return c ? d => Fa[d >> 1] : d => Ia[d >> 1];
    case 4:
      return c ? d => C[d >> 2] : d => F[d >> 2];
    default:
      throw new TypeError(`invalid integer width (${b}): ${a}`);
  }
}, Dd = "undefined" != typeof TextDecoder ? new TextDecoder("utf-16le") : void 0, Ed = (a, b) => {
  var c = a >> 1;
  for (var d = c + b / 2; !(c >= d) && Ia[c];) {
    ++c;
  }
  c <<= 1;
  if (32 < c - a && Dd) {
    return Dd.decode(B.subarray(a, c));
  }
  c = "";
  for (d = 0; !(d >= b / 2); ++d) {
    var e = Fa[a + 2 * d >> 1];
    if (0 == e) {
      break;
    }
    c += String.fromCharCode(e);
  }
  return c;
}, Fd = (a, b, c) => {
  c ??= 2147483647;
  if (2 > c) {
    return 0;
  }
  c -= 2;
  var d = b;
  c = c < 2 * a.length ? c / 2 : a.length;
  for (var e = 0; e < c; ++e) {
    Fa[b >> 1] = a.charCodeAt(e), b += 2;
  }
  Fa[b >> 1] = 0;
  return b - d;
}, Gd = a => 2 * a.length, Hd = (a, b) => {
  for (var c = 0, d = ""; !(c >= b / 4);) {
    var e = C[a + 4 * c >> 2];
    if (0 == e) {
      break;
    }
    ++c;
    65536 <= e ? (e -= 65536, d += String.fromCharCode(55296 | e >> 10, 56320 | e & 1023)) : d += String.fromCharCode(e);
  }
  return d;
}, Id = (a, b, c) => {
  c ??= 2147483647;
  if (4 > c) {
    return 0;
  }
  var d = b;
  c = d + c - 4;
  for (var e = 0; e < a.length; ++e) {
    var f = a.charCodeAt(e);
    if (55296 <= f && 57343 >= f) {
      var g = a.charCodeAt(++e);
      f = 65536 + ((f & 1023) << 10) | g & 1023;
    }
    C[b >> 2] = f;
    b += 4;
    if (b + 4 > c) {
      break;
    }
  }
  C[b >> 2] = 0;
  return b - d;
}, Jd = a => {
  for (var b = 0, c = 0; c < a.length; ++c) {
    var d = a.charCodeAt(c);
    55296 <= d && 57343 >= d && ++c;
    b += 4;
  }
  return b;
}, Kd = (a, b, c) => {
  var d = [];
  a = a.toWireType(d, c);
  d.length && (F[b >> 2] = tc(d));
  return a;
}, Ld = [], Md = {}, Nd = a => {
  var b = Md[a];
  return void 0 === b ? S(a) : b;
}, Od = a => {
  var b = Ld.length;
  Ld.push(a);
  return b;
}, Pd = (a, b) => {
  for (var c = Array(a), d = 0; d < a; ++d) {
    c[d] = Gc(F[b + 4 * d >> 2], "parameter " + d);
  }
  return c;
}, Qd = Reflect.construct, Rd = a => 0 === a % 4 && (0 !== a % 100 || 0 === a % 400), Sd = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335], Td = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334], Ud = [], Vd = {}, Xd = () => {
  if (!Wd) {
    var a = {USER:"web_user", LOGNAME:"web_user", PATH:"/", PWD:"/", HOME:"/home/web_user", LANG:("object" == typeof navigator && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8", _:ta || "./this.program"}, b;
    for (b in Vd) {
      void 0 === Vd[b] ? delete a[b] : a[b] = Vd[b];
    }
    var c = [];
    for (b in a) {
      c.push(`${b}=${a[b]}`);
    }
    Wd = c;
  }
  return Wd;
}, Wd, Yd = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], Zd = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], $d = (a, b, c, d) => {
  function e(m, u, r) {
    for (m = "number" == typeof m ? m.toString() : m || ""; m.length < u;) {
      m = r[0] + m;
    }
    return m;
  }
  function f(m, u) {
    return e(m, u, "0");
  }
  function g(m, u) {
    function r(I) {
      return 0 > I ? -1 : 0 < I ? 1 : 0;
    }
    var D;
    0 === (D = r(m.getFullYear() - u.getFullYear())) && 0 === (D = r(m.getMonth() - u.getMonth())) && (D = r(m.getDate() - u.getDate()));
    return D;
  }
  function k(m) {
    switch(m.getDay()) {
      case 0:
        return new Date(m.getFullYear() - 1, 11, 29);
      case 1:
        return m;
      case 2:
        return new Date(m.getFullYear(), 0, 3);
      case 3:
        return new Date(m.getFullYear(), 0, 2);
      case 4:
        return new Date(m.getFullYear(), 0, 1);
      case 5:
        return new Date(m.getFullYear() - 1, 11, 31);
      case 6:
        return new Date(m.getFullYear() - 1, 11, 30);
    }
  }
  function p(m) {
    var u = m.ca;
    for (m = new Date((new Date(m.da + 1900, 0, 1)).getTime()); 0 < u;) {
      var r = m.getMonth(), D = (Rd(m.getFullYear()) ? Yd : Zd)[r];
      if (u > D - m.getDate()) {
        u -= D - m.getDate() + 1, m.setDate(1), 11 > r ? m.setMonth(r + 1) : (m.setMonth(0), m.setFullYear(m.getFullYear() + 1));
      } else {
        m.setDate(m.getDate() + u);
        break;
      }
    }
    r = new Date(m.getFullYear() + 1, 0, 4);
    u = k(new Date(m.getFullYear(), 0, 4));
    r = k(r);
    return 0 >= g(u, m) ? 0 >= g(r, m) ? m.getFullYear() + 1 : m.getFullYear() : m.getFullYear() - 1;
  }
  var n = F[d + 40 >> 2];
  d = {rc:C[d >> 2], qc:C[d + 4 >> 2], Ea:C[d + 8 >> 2], Ra:C[d + 12 >> 2], Fa:C[d + 16 >> 2], da:C[d + 20 >> 2], S:C[d + 24 >> 2], ca:C[d + 28 >> 2], Vc:C[d + 32 >> 2], pc:C[d + 36 >> 2], sc:n ? n ? qb(B, n) : "" : ""};
  c = c ? qb(B, c) : "";
  n = {"%c":"%a %b %d %H:%M:%S %Y", "%D":"%m/%d/%y", "%F":"%Y-%m-%d", "%h":"%b", "%r":"%I:%M:%S %p", "%R":"%H:%M", "%T":"%H:%M:%S", "%x":"%m/%d/%y", "%X":"%H:%M:%S", "%Ec":"%c", "%EC":"%C", "%Ex":"%m/%d/%y", "%EX":"%H:%M:%S", "%Ey":"%y", "%EY":"%Y", "%Od":"%d", "%Oe":"%e", "%OH":"%H", "%OI":"%I", "%Om":"%m", "%OM":"%M", "%OS":"%S", "%Ou":"%u", "%OU":"%U", "%OV":"%V", "%Ow":"%w", "%OW":"%W", "%Oy":"%y",};
  for (var t in n) {
    c = c.replace(new RegExp(t, "g"), n[t]);
  }
  var x = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" "), y = "January February March April May June July August September October November December".split(" ");
  n = {"%a":m => x[m.S].substring(0, 3), "%A":m => x[m.S], "%b":m => y[m.Fa].substring(0, 3), "%B":m => y[m.Fa], "%C":m => f((m.da + 1900) / 100 | 0, 2), "%d":m => f(m.Ra, 2), "%e":m => e(m.Ra, 2, " "), "%g":m => p(m).toString().substring(2), "%G":p, "%H":m => f(m.Ea, 2), "%I":m => {
    m = m.Ea;
    0 == m ? m = 12 : 12 < m && (m -= 12);
    return f(m, 2);
  }, "%j":m => {
    for (var u = 0, r = 0; r <= m.Fa - 1; u += (Rd(m.da + 1900) ? Yd : Zd)[r++]) {
    }
    return f(m.Ra + u, 3);
  }, "%m":m => f(m.Fa + 1, 2), "%M":m => f(m.qc, 2), "%n":() => "\n", "%p":m => 0 <= m.Ea && 12 > m.Ea ? "AM" : "PM", "%S":m => f(m.rc, 2), "%t":() => "\t", "%u":m => m.S || 7, "%U":m => f(Math.floor((m.ca + 7 - m.S) / 7), 2), "%V":m => {
    var u = Math.floor((m.ca + 7 - (m.S + 6) % 7) / 7);
    2 >= (m.S + 371 - m.ca - 2) % 7 && u++;
    if (u) {
      53 == u && (r = (m.S + 371 - m.ca) % 7, 4 == r || 3 == r && Rd(m.da) || (u = 1));
    } else {
      u = 52;
      var r = (m.S + 7 - m.ca - 1) % 7;
      (4 == r || 5 == r && Rd(m.da % 400 - 1)) && u++;
    }
    return f(u, 2);
  }, "%w":m => m.S, "%W":m => f(Math.floor((m.ca + 7 - (m.S + 6) % 7) / 7), 2), "%y":m => (m.da + 1900).toString().substring(2), "%Y":m => m.da + 1900, "%z":m => {
    m = m.pc;
    var u = 0 <= m;
    m = Math.abs(m) / 60;
    return (u ? "+" : "-") + String("0000" + (m / 60 * 100 + m % 60)).slice(-4);
  }, "%Z":m => m.sc, "%%":() => "%"};
  c = c.replace(/%%/g, "\x00\x00");
  for (t in n) {
    c.includes(t) && (c = c.replace(new RegExp(t, "g"), n[t](d)));
  }
  c = c.replace(/\0\0/g, "%");
  t = vb(c, !1);
  if (t.length > b) {
    return 0;
  }
  z.set(t, a);
  return t.length - 1;
};
[44].forEach(a => {
  Fb[a] = new N(a);
  Fb[a].stack = "<generic error, no stack>";
});
Mb = Array(4096);
$b(O, "/");
gc("/tmp");
gc("/home");
gc("/home/web_user");
(function() {
  gc("/dev");
  yb(259, {read:() => 0, write:(d, e, f, g) => g,});
  hc("/dev/null", 259);
  xb(1280, Ab);
  xb(1536, Bb);
  hc("/dev/tty", 1280);
  hc("/dev/tty1", 1536);
  var a = new Uint8Array(1024), b = 0, c = () => {
    0 === b && (b = nb(a).byteLength);
    return a[--b];
  };
  nc("random", c);
  nc("urandom", c);
  gc("/dev/shm");
  gc("/dev/shm/tmp");
})();
(function() {
  gc("/proc");
  var a = gc("/proc/self");
  gc("/proc/self/fd");
  $b({V() {
    var b = Eb(a, "fd", 16895, 73);
    b.j = {ka(c, d) {
      var e = Xb(+d);
      c = {parent:null, V:{mb:"fake"}, j:{ma:() => e.path},};
      return c.parent = c;
    }};
    return b;
  }}, "/proc/self/fd");
})();
P = l.BindingError = class extends Error {
  constructor(a) {
    super(a);
    this.name = "BindingError";
  }
};
sc.push(0, 1, void 0, 1, null, 1, !0, 1, !1, 1,);
l.count_emval_handles = () => sc.length / 2 - 5 - rc.length;
vc = l.PureVirtualError = uc("PureVirtualError");
for (var ae = Array(256), be = 0; 256 > be; ++be) {
  ae[be] = String.fromCharCode(be);
}
wc = ae;
l.getInheritedInstanceCount = () => Object.keys(Ac).length;
l.getLiveInheritedInstances = () => {
  var a = [], b;
  for (b in Ac) {
    Ac.hasOwnProperty(b) && a.push(Ac[b]);
  }
  return a;
};
l.flushPendingDeletes = yc;
l.setDelayFunction = a => {
  zc = a;
  xc.length && zc && zc(yc);
};
Mc = l.InternalError = class extends Error {
  constructor(a) {
    super(a);
    this.name = "InternalError";
  }
};
Object.assign(Xc.prototype, {isAliasOf:function(a) {
  if (!(this instanceof Xc && a instanceof Xc)) {
    return !1;
  }
  var b = this.g.u.i, c = this.g.o;
  a.g = a.g;
  var d = a.g.u.i;
  for (a = a.g.o; b.C;) {
    c = b.na(c), b = b.C;
  }
  for (; d.C;) {
    a = d.na(a), d = d.C;
  }
  return b === d && c === a;
}, clone:function() {
  this.g.o || Wc(this);
  if (this.g.ia) {
    return this.g.count.value += 1, this;
  }
  var a = Nc, b = Object, c = b.create, d = Object.getPrototypeOf(this), e = this.g;
  a = a(c.call(b, d, {g:{value:{count:e.count, fa:e.fa, ia:e.ia, o:e.o, u:e.u, F:e.F, K:e.K,},}}));
  a.g.count.value += 1;
  a.g.fa = !1;
  return a;
}, ["delete"]() {
  this.g.o || Wc(this);
  if (this.g.fa && !this.g.ia) {
    throw new P("Object already scheduled for deletion");
  }
  Hc(this);
  var a = this.g;
  --a.count.value;
  0 === a.count.value && (a.F ? a.K.P(a.F) : a.u.i.P(a.o));
  this.g.ia || (this.g.F = void 0, this.g.o = void 0);
}, isDeleted:function() {
  return !this.g.o;
}, deleteLater:function() {
  this.g.o || Wc(this);
  if (this.g.fa && !this.g.ia) {
    throw new P("Object already scheduled for deletion");
  }
  xc.push(this);
  1 === xc.length && zc && zc(yc);
  this.g.fa = !0;
  return this;
},});
Object.assign(gd.prototype, {Tb(a) {
  this.rb && (a = this.rb(a));
  return a;
}, bb(a) {
  this.P?.(a);
}, argPackAdvance:8, readValueFromPointer:Rc, fromWireType:function(a) {
  function b() {
    return this.ta ? Oc(this.i.N, {u:this.jc, o:c, K:this, F:a,}) : Oc(this.i.N, {u:this, o:a,});
  }
  var c = this.Tb(a);
  if (!c) {
    return this.bb(a), null;
  }
  var d = Lc(this.i, c);
  if (void 0 !== d) {
    if (0 === d.g.count.value) {
      return d.g.o = c, d.g.F = a, d.clone();
    }
    d = d.clone();
    this.bb(a);
    return d;
  }
  d = this.i.Sb(c);
  d = Kc[d];
  if (!d) {
    return b.call(this);
  }
  d = this.sa ? d.Jb : d.pointerType;
  var e = Jc(c, this.i, d.i);
  return null === e ? b.call(this) : this.ta ? Oc(d.i.N, {u:d, o:e, K:this, F:a,}) : Oc(d.i.N, {u:d, o:e,});
},});
od = l.UnboundTypeError = uc("UnboundTypeError");
var ee = {__syscall_fcntl64:function(a, b, c) {
  hb = c;
  try {
    var d = Xb(a);
    switch(b) {
      case 0:
        var e = gb();
        if (0 > e) {
          break;
        }
        for (; Kb[e];) {
          e++;
        }
        return Zb(d, e).X;
      case 1:
      case 2:
        return 0;
      case 3:
        return d.flags;
      case 4:
        return e = gb(), d.flags |= e, 0;
      case 12:
        return e = gb(), Fa[e + 0 >> 1] = 2, 0;
      case 13:
      case 14:
        return 0;
    }
    return -28;
  } catch (f) {
    if ("undefined" == typeof pc || "ErrnoError" !== f.name) {
      throw f;
    }
    return -f.aa;
  }
}, __syscall_ioctl:function(a, b, c) {
  hb = c;
  try {
    var d = Xb(a);
    switch(b) {
      case 21509:
        return d.s ? 0 : -59;
      case 21505:
        if (!d.s) {
          return -59;
        }
        if (d.s.W.Zb) {
          a = [3, 28, 127, 21, 4, 0, 1, 0, 17, 19, 26, 0, 18, 15, 23, 22, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,];
          var e = gb();
          C[e >> 2] = 25856;
          C[e + 4 >> 2] = 5;
          C[e + 8 >> 2] = 191;
          C[e + 12 >> 2] = 35387;
          for (var f = 0; 32 > f; f++) {
            z[e + f + 17] = a[f] || 0;
          }
        }
        return 0;
      case 21510:
      case 21511:
      case 21512:
        return d.s ? 0 : -59;
      case 21506:
      case 21507:
      case 21508:
        if (!d.s) {
          return -59;
        }
        if (d.s.W.$b) {
          for (e = gb(), a = [], f = 0; 32 > f; f++) {
            a.push(z[e + f + 17]);
          }
        }
        return 0;
      case 21519:
        if (!d.s) {
          return -59;
        }
        e = gb();
        return C[e >> 2] = 0;
      case 21520:
        return d.s ? -28 : -59;
      case 21531:
        e = gb();
        if (!d.m.Yb) {
          throw new N(59);
        }
        return d.m.Yb(d, b, e);
      case 21523:
        if (!d.s) {
          return -59;
        }
        d.s.W.ac && (f = [24, 80], e = gb(), Fa[e >> 1] = f[0], Fa[e + 2 >> 1] = f[1]);
        return 0;
      case 21524:
        return d.s ? 0 : -59;
      case 21515:
        return d.s ? 0 : -59;
      default:
        return -28;
    }
  } catch (g) {
    if ("undefined" == typeof pc || "ErrnoError" !== g.name) {
      throw g;
    }
    return -g.aa;
  }
}, __syscall_openat:function(a, b, c, d) {
  hb = d;
  try {
    b = b ? qb(B, b) : "";
    var e = b;
    if ("/" === e.charAt(0)) {
      b = e;
    } else {
      var f = -100 === a ? "/" : Xb(a).path;
      if (0 == e.length) {
        throw new N(44);
      }
      b = jb(f + "/" + e);
    }
    var g = d ? gb() : 0;
    return jc(b, c, g).X;
  } catch (k) {
    if ("undefined" == typeof pc || "ErrnoError" !== k.name) {
      throw k;
    }
    return -k.aa;
  }
}, _abort_js:() => {
  Ta("");
}, _embind_create_inheriting_constructor:(a, b, c) => {
  a = S(a);
  b = Gc(b, "wrapper");
  c = Q(c);
  var d = b.i, e = d.N, f = d.C.N, g = d.C.constructor;
  a = qc(a, function(...k) {
    d.C.qb.forEach(function(p) {
      if (this[p] === f[p]) {
        throw new vc(`Pure virtual function ${p} must be implemented in JavaScript`);
      }
    }.bind(this));
    Object.defineProperty(this, "__parent", {value:e});
    this.__construct(...k);
  });
  e.__construct = function(...k) {
    if (this === e) {
      throw new P("Pass correct 'this' to __construct");
    }
    k = g.implement(this, ...k);
    Hc(k);
    var p = k.g;
    k.notifyOnDestruction();
    p.ia = !0;
    Object.defineProperties(this, {g:{value:p}});
    Nc(this);
    k = p.o;
    k = Bc(d, k);
    if (Ac.hasOwnProperty(k)) {
      throw new P(`Tried to register registered instance: ${k}`);
    }
    Ac[k] = this;
  };
  e.__destruct = function() {
    if (this === e) {
      throw new P("Pass correct 'this' to __destruct");
    }
    Hc(this);
    var k = this.g.o;
    k = Bc(d, k);
    if (Ac.hasOwnProperty(k)) {
      delete Ac[k];
    } else {
      throw new P(`Tried to unregister unregistered instance: ${k}`);
    }
  };
  a.prototype = Object.create(e);
  Object.assign(a.prototype, c);
  return tc(a);
}, _embind_finalize_value_object:a => {
  var b = Pc[a];
  delete Pc[a];
  var c = b.Oa, d = b.P, e = b.fb, f = e.map(g => g.Wb).concat(e.map(g => g.mc));
  U([a], f, g => {
    var k = {};
    e.forEach((p, n) => {
      var t = g[n], x = p.Ub, y = p.Vb, m = g[n + e.length], u = p.lc, r = p.nc;
      k[p.Qb] = {read:D => t.fromWireType(x(y, D)), write:(D, I) => {
        var w = [];
        u(r, D, m.toWireType(w, I));
        Qc(w);
      }};
    });
    return [{name:b.name, fromWireType:p => {
      var n = {}, t;
      for (t in k) {
        n[t] = k[t].read(p);
      }
      d(p);
      return n;
    }, toWireType:(p, n) => {
      for (var t in k) {
        if (!(t in n)) {
          throw new TypeError(`Missing field: "${t}"`);
        }
      }
      var x = c();
      for (t in k) {
        k[t].write(x, n[t]);
      }
      null !== p && p.push(d, x);
      return x;
    }, argPackAdvance:8, readValueFromPointer:Rc, M:d,}];
  });
}, _embind_register_bigint:() => {
}, _embind_register_bool:(a, b, c, d) => {
  b = S(b);
  Uc(a, {name:b, fromWireType:function(e) {
    return !!e;
  }, toWireType:function(e, f) {
    return f ? c : d;
  }, argPackAdvance:8, readValueFromPointer:function(e) {
    return this.fromWireType(B[e]);
  }, M:null,});
}, _embind_register_class:(a, b, c, d, e, f, g, k, p, n, t, x, y) => {
  t = S(t);
  f = W(e, f);
  k &&= W(g, k);
  n &&= W(p, n);
  y = W(x, y);
  var m = $c(t);
  Zc(m, function() {
    pd(`Cannot construct ${t} due to unbound types`, [d]);
  });
  U([a, b, c], d ? [d] : [], u => {
    u = u[0];
    if (d) {
      var r = u.i;
      var D = r.N;
    } else {
      D = Xc.prototype;
    }
    u = qc(t, function(...R) {
      if (Object.getPrototypeOf(this) !== I) {
        throw new P("Use 'new' to construct " + t);
      }
      if (void 0 === w.$) {
        throw new P(t + " has no accessible constructor");
      }
      var V = w.$[R.length];
      if (void 0 === V) {
        throw new P(`Tried to invoke ctor of ${t} with invalid number of parameters (${R.length}) - expected (${Object.keys(w.$).toString()}) parameters instead!`);
      }
      return V.apply(this, R);
    });
    var I = Object.create(D, {constructor:{value:u},});
    u.prototype = I;
    var w = new ad(t, u, I, y, r, f, k, n);
    if (w.C) {
      var L;
      (L = w.C).oa ?? (L.oa = []);
      w.C.oa.push(w);
    }
    r = new gd(t, w, !0, !1, !1);
    L = new gd(t + "*", w, !1, !1, !1);
    D = new gd(t + " const*", w, !1, !0, !1);
    Kc[a] = {pointerType:L, Jb:D};
    hd(m, u);
    return [r, L, D];
  });
}, _embind_register_class_class_function:(a, b, c, d, e, f, g) => {
  var k = vd(c, d);
  b = S(b);
  b = wd(b);
  f = W(e, f);
  U([], [a], p => {
    function n() {
      pd(`Cannot call ${t} due to unbound types`, k);
    }
    p = p[0];
    var t = `${p.name}.${b}`;
    b.startsWith("@@") && (b = Symbol[b.substring(2)]);
    var x = p.i.constructor;
    void 0 === x[b] ? (n.ea = c - 1, x[b] = n) : (Yc(x, b, t), x[b].A[c - 1] = n);
    U([], k, y => {
      y = ud(t, [y[0], null].concat(y.slice(1)), null, f, g);
      void 0 === x[b].A ? (y.ea = c - 1, x[b] = y) : x[b].A[c - 1] = y;
      if (p.i.oa) {
        for (const m of p.i.oa) {
          m.constructor.hasOwnProperty(b) || (m.constructor[b] = y);
        }
      }
      return [];
    });
    return [];
  });
}, _embind_register_class_class_property:(a, b, c, d, e, f, g, k) => {
  b = S(b);
  f = W(e, f);
  U([], [a], p => {
    p = p[0];
    var n = `${p.name}.${b}`, t = {get() {
      pd(`Cannot access ${n} due to unbound types`, [c]);
    }, enumerable:!0, configurable:!0};
    t.set = k ? () => {
      pd(`Cannot access ${n} due to unbound types`, [c]);
    } : () => {
      throw new P(`${n} is a read-only property`);
    };
    Object.defineProperty(p.i.constructor, b, t);
    U([], [c], x => {
      x = x[0];
      var y = {get() {
        return x.fromWireType(f(d));
      }, enumerable:!0};
      k && (k = W(g, k), y.set = m => {
        var u = [];
        k(d, x.toWireType(u, m));
        Qc(u);
      });
      Object.defineProperty(p.i.constructor, b, y);
      return [];
    });
    return [];
  });
}, _embind_register_class_constructor:(a, b, c, d, e, f) => {
  var g = vd(b, c);
  e = W(d, e);
  U([], [a], k => {
    k = k[0];
    var p = `constructor ${k.name}`;
    void 0 === k.i.$ && (k.i.$ = []);
    if (void 0 !== k.i.$[b - 1]) {
      throw new P(`Cannot register multiple constructors with identical number of parameters (${b - 1}) for class '${k.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
    }
    k.i.$[b - 1] = () => {
      pd(`Cannot construct ${k.name} due to unbound types`, g);
    };
    U([], g, n => {
      n.splice(1, 0, null);
      k.i.$[b - 1] = ud(p, n, null, e, f);
      return [];
    });
    return [];
  });
}, _embind_register_class_function:(a, b, c, d, e, f, g, k) => {
  var p = vd(c, d);
  b = S(b);
  b = wd(b);
  f = W(e, f);
  U([], [a], n => {
    function t() {
      pd(`Cannot call ${x} due to unbound types`, p);
    }
    n = n[0];
    var x = `${n.name}.${b}`;
    b.startsWith("@@") && (b = Symbol[b.substring(2)]);
    k && n.i.qb.push(b);
    var y = n.i.N, m = y[b];
    void 0 === m || void 0 === m.A && m.className !== n.name && m.ea === c - 2 ? (t.ea = c - 2, t.className = n.name, y[b] = t) : (Yc(y, b, x), y[b].A[c - 2] = t);
    U([], p, u => {
      u = ud(x, u, n, f, g);
      void 0 === y[b].A ? (u.ea = c - 2, y[b] = u) : y[b].A[c - 2] = u;
      return [];
    });
    return [];
  });
}, _embind_register_class_property:(a, b, c, d, e, f, g, k, p, n) => {
  b = S(b);
  e = W(d, e);
  U([], [a], t => {
    t = t[0];
    var x = `${t.name}.${b}`, y = {get() {
      pd(`Cannot access ${x} due to unbound types`, [c, g]);
    }, enumerable:!0, configurable:!0};
    y.set = p ? () => pd(`Cannot access ${x} due to unbound types`, [c, g]) : () => {
      throw new P(x + " is a read-only property");
    };
    Object.defineProperty(t.i.N, b, y);
    U([], p ? [c, g] : [c], m => {
      var u = m[0], r = {get() {
        var I = xd(this, t, x + " getter");
        return u.fromWireType(e(f, I));
      }, enumerable:!0};
      if (p) {
        p = W(k, p);
        var D = m[1];
        r.set = function(I) {
          var w = xd(this, t, x + " setter"), L = [];
          p(n, w, D.toWireType(L, I));
          Qc(L);
        };
      }
      Object.defineProperty(t.i.N, b, r);
      return [];
    });
    return [];
  });
}, _embind_register_emval:a => Uc(a, zd), _embind_register_enum:(a, b, c, d) => {
  function e() {
  }
  b = S(b);
  e.values = {};
  Uc(a, {name:b, constructor:e, fromWireType:function(f) {
    return this.constructor.values[f];
  }, toWireType:(f, g) => g.value, argPackAdvance:8, readValueFromPointer:Ad(b, c, d), M:null,});
  Zc(b, e);
}, _embind_register_enum_value:(a, b, c) => {
  var d = Gc(a, "enum");
  b = S(b);
  a = d.constructor;
  d = Object.create(d.constructor.prototype, {value:{value:c}, constructor:{value:qc(`${d.name}_${b}`, function() {
  })},});
  a.values[c] = d;
  a[b] = d;
}, _embind_register_float:(a, b, c) => {
  b = S(b);
  Uc(a, {name:b, fromWireType:d => d, toWireType:(d, e) => e, argPackAdvance:8, readValueFromPointer:Bd(b, c), M:null,});
}, _embind_register_function:(a, b, c, d, e, f) => {
  var g = vd(b, c);
  a = S(a);
  a = wd(a);
  e = W(d, e);
  Zc(a, function() {
    pd(`Cannot call ${a} due to unbound types`, g);
  }, b - 1);
  U([], g, k => {
    hd(a, ud(a, [k[0], null].concat(k.slice(1)), null, e, f), b - 1);
    return [];
  });
}, _embind_register_integer:(a, b, c, d, e) => {
  b = S(b);
  -1 === e && (e = 4294967295);
  e = k => k;
  if (0 === d) {
    var f = 32 - 8 * c;
    e = k => k << f >>> f;
  }
  var g = b.includes("unsigned") ? function(k, p) {
    return p >>> 0;
  } : function(k, p) {
    return p;
  };
  Uc(a, {name:b, fromWireType:e, toWireType:g, argPackAdvance:8, readValueFromPointer:Cd(b, c, 0 !== d), M:null,});
}, _embind_register_memory_view:(a, b, c) => {
  function d(f) {
    return new e(z.buffer, F[f + 4 >> 2], F[f >> 2]);
  }
  var e = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array,][b];
  c = S(c);
  Uc(a, {name:c, fromWireType:d, argPackAdvance:8, readValueFromPointer:d,}, {Xb:!0,});
}, _embind_register_std_string:(a, b) => {
  b = S(b);
  var c = "std::string" === b;
  Uc(a, {name:b, fromWireType:function(d) {
    var e = F[d >> 2], f = d + 4;
    if (c) {
      for (var g = f, k = 0; k <= e; ++k) {
        var p = f + k;
        if (k == e || 0 == B[p]) {
          g = g ? qb(B, g, p - g) : "";
          if (void 0 === n) {
            var n = g;
          } else {
            n += String.fromCharCode(0), n += g;
          }
          g = p + 1;
        }
      }
    } else {
      n = Array(e);
      for (k = 0; k < e; ++k) {
        n[k] = String.fromCharCode(B[f + k]);
      }
      n = n.join("");
    }
    Ec(d);
    return n;
  }, toWireType:function(d, e) {
    e instanceof ArrayBuffer && (e = new Uint8Array(e));
    var f = "string" == typeof e;
    if (!(f || e instanceof Uint8Array || e instanceof Uint8ClampedArray || e instanceof Int8Array)) {
      throw new P("Cannot pass non-string to std::string");
    }
    var g = c && f ? sb(e) : e.length;
    var k = ce(4 + g + 1), p = k + 4;
    F[k >> 2] = g;
    if (c && f) {
      ub(e, B, p, g + 1);
    } else {
      if (f) {
        for (f = 0; f < g; ++f) {
          var n = e.charCodeAt(f);
          if (255 < n) {
            throw Ec(p), new P("String has UTF-16 code units that do not fit in 8 bits");
          }
          B[p + f] = n;
        }
      } else {
        for (f = 0; f < g; ++f) {
          B[p + f] = e[f];
        }
      }
    }
    null !== d && d.push(Ec, k);
    return k;
  }, argPackAdvance:8, readValueFromPointer:Rc, M(d) {
    Ec(d);
  },});
}, _embind_register_std_wstring:(a, b, c) => {
  c = S(c);
  if (2 === b) {
    var d = Ed;
    var e = Fd;
    var f = Gd;
    var g = k => Ia[k >> 1];
  } else {
    4 === b && (d = Hd, e = Id, f = Jd, g = k => F[k >> 2]);
  }
  Uc(a, {name:c, fromWireType:k => {
    for (var p = F[k >> 2], n, t = k + 4, x = 0; x <= p; ++x) {
      var y = k + 4 + x * b;
      if (x == p || 0 == g(y)) {
        t = d(t, y - t), void 0 === n ? n = t : (n += String.fromCharCode(0), n += t), t = y + b;
      }
    }
    Ec(k);
    return n;
  }, toWireType:(k, p) => {
    if ("string" != typeof p) {
      throw new P(`Cannot pass non-string to C++ string type ${c}`);
    }
    var n = f(p), t = ce(4 + n + b);
    F[t >> 2] = n / b;
    e(p, t + 4, n + b);
    null !== k && k.push(Ec, t);
    return t;
  }, argPackAdvance:8, readValueFromPointer:Rc, M(k) {
    Ec(k);
  }});
}, _embind_register_value_object:(a, b, c, d, e, f) => {
  Pc[a] = {name:S(b), Oa:W(c, d), P:W(e, f), fb:[],};
}, _embind_register_value_object_field:(a, b, c, d, e, f, g, k, p, n) => {
  Pc[a].fb.push({Qb:S(b), Wb:c, Ub:W(d, e), Vb:f, mc:g, lc:W(k, p), nc:n,});
}, _embind_register_void:(a, b) => {
  b = S(b);
  Uc(a, {Oc:!0, name:b, argPackAdvance:0, fromWireType:() => {
  }, toWireType:() => {
  },});
}, _emscripten_get_now_is_monotonic:() => 1, _emscripten_memcpy_js:(a, b, c) => B.copyWithin(a, b, b + c), _emscripten_throw_longjmp:() => {
  throw Infinity;
}, _emval_as:(a, b, c) => {
  a = Q(a);
  b = Gc(b, "emval::as");
  return Kd(b, c, a);
}, _emval_call:(a, b, c, d) => {
  a = Ld[a];
  b = Q(b);
  return a(null, b, c, d);
}, _emval_call_method:(a, b, c, d, e) => {
  a = Ld[a];
  b = Q(b);
  c = Nd(c);
  return a(b, b[c], d, e);
}, _emval_decref:yd, _emval_get_method_caller:(a, b, c) => {
  var d = Pd(a, b), e = d.shift();
  a--;
  var f = Array(a);
  b = `methodCaller<(${d.map(g => g.name).join(", ")}) => ${e.name}>`;
  return Od(qc(b, (g, k, p, n) => {
    for (var t = 0, x = 0; x < a; ++x) {
      f[x] = d[x].readValueFromPointer(n + t), t += d[x].argPackAdvance;
    }
    g = 1 === c ? Qd(k, f) : k.apply(g, f);
    return Kd(e, p, g);
  }));
}, _emval_get_module_property:a => {
  a = Nd(a);
  return tc(l[a]);
}, _emval_get_property:(a, b) => {
  a = Q(a);
  b = Q(b);
  return tc(a[b]);
}, _emval_incref:a => {
  9 < a && (sc[a + 1] += 1);
}, _emval_new_array:() => tc([]), _emval_new_cstring:a => tc(Nd(a)), _emval_new_object:() => tc({}), _emval_run_destructors:a => {
  var b = Q(a);
  Qc(b);
  yd(a);
}, _emval_set_property:(a, b, c) => {
  a = Q(a);
  b = Q(b);
  c = Q(c);
  a[b] = c;
}, _emval_take_value:(a, b) => {
  a = Gc(a, "_emval_take_value");
  a = a.readValueFromPointer(b);
  return tc(a);
}, _gmtime_js:function(a, b, c) {
  a = new Date(1000 * (b + 2097152 >>> 0 < 4194305 - !!a ? (a >>> 0) + 4294967296 * b : NaN));
  C[c >> 2] = a.getUTCSeconds();
  C[c + 4 >> 2] = a.getUTCMinutes();
  C[c + 8 >> 2] = a.getUTCHours();
  C[c + 12 >> 2] = a.getUTCDate();
  C[c + 16 >> 2] = a.getUTCMonth();
  C[c + 20 >> 2] = a.getUTCFullYear() - 1900;
  C[c + 24 >> 2] = a.getUTCDay();
  C[c + 28 >> 2] = (a.getTime() - Date.UTC(a.getUTCFullYear(), 0, 1, 0, 0, 0, 0)) / 864E5 | 0;
}, _localtime_js:function(a, b, c) {
  a = new Date(1000 * (b + 2097152 >>> 0 < 4194305 - !!a ? (a >>> 0) + 4294967296 * b : NaN));
  C[c >> 2] = a.getSeconds();
  C[c + 4 >> 2] = a.getMinutes();
  C[c + 8 >> 2] = a.getHours();
  C[c + 12 >> 2] = a.getDate();
  C[c + 16 >> 2] = a.getMonth();
  C[c + 20 >> 2] = a.getFullYear() - 1900;
  C[c + 24 >> 2] = a.getDay();
  C[c + 28 >> 2] = (Rd(a.getFullYear()) ? Sd : Td)[a.getMonth()] + a.getDate() - 1 | 0;
  C[c + 36 >> 2] = -(60 * a.getTimezoneOffset());
  b = (new Date(a.getFullYear(), 6, 1)).getTimezoneOffset();
  var d = (new Date(a.getFullYear(), 0, 1)).getTimezoneOffset();
  C[c + 32 >> 2] = (b != d && a.getTimezoneOffset() == Math.min(d, b)) | 0;
}, _tzset_js:(a, b, c, d) => {
  var e = (new Date()).getFullYear(), f = new Date(e, 0, 1), g = new Date(e, 6, 1);
  e = f.getTimezoneOffset();
  var k = g.getTimezoneOffset();
  F[a >> 2] = 60 * Math.max(e, k);
  C[b >> 2] = Number(e != k);
  a = p => p.toLocaleTimeString(void 0, {hour12:!1, timeZoneName:"short"}).split(" ")[1];
  f = a(f);
  g = a(g);
  k < e ? (ub(f, B, c, 17), ub(g, B, d, 17)) : (ub(f, B, d, 17), ub(g, B, c, 17));
}, emscripten_asm_const_int:(a, b, c) => {
  Ud.length = 0;
  for (var d; d = B[b++];) {
    var e = 105 != d;
    e &= 112 != d;
    c += e && c % 8 ? 4 : 0;
    Ud.push(112 == d ? F[c >> 2] : 105 == d ? C[c >> 2] : Ka[c >> 3]);
    c += e ? 8 : 4;
  }
  return eb[a](...Ud);
}, emscripten_date_now:() => Date.now(), emscripten_get_now:() => performance.now(), emscripten_resize_heap:a => {
  var b = B.length;
  a >>>= 0;
  if (2147483648 < a) {
    return !1;
  }
  for (var c = 1; 4 >= c; c *= 2) {
    var d = b * (1 + 0.2 / c);
    d = Math.min(d, a + 100663296);
    var e = Math;
    d = Math.max(a, d);
    a: {
      e = (e.min.call(e, 2147483648, d + (65536 - d % 65536) % 65536) - Da.buffer.byteLength + 65535) / 65536;
      try {
        Da.grow(e);
        La();
        var f = 1;
        break a;
      } catch (g) {
      }
      f = void 0;
    }
    if (f) {
      return !0;
    }
  }
  return !1;
}, environ_get:(a, b) => {
  var c = 0;
  Xd().forEach((d, e) => {
    var f = b + c;
    e = F[a + 4 * e >> 2] = f;
    for (f = 0; f < d.length; ++f) {
      z[e++] = d.charCodeAt(f);
    }
    z[e] = 0;
    c += d.length + 1;
  });
  return 0;
}, environ_sizes_get:(a, b) => {
  var c = Xd();
  F[a >> 2] = c.length;
  var d = 0;
  c.forEach(e => d += e.length + 1);
  F[b >> 2] = d;
  return 0;
}, fd_close:function(a) {
  try {
    var b = Xb(a);
    if (null === b.X) {
      throw new N(8);
    }
    b.La && (b.La = null);
    try {
      b.m.close && b.m.close(b);
    } catch (c) {
      throw c;
    } finally {
      Kb[b.X] = null;
    }
    b.X = null;
    return 0;
  } catch (c) {
    if ("undefined" == typeof pc || "ErrnoError" !== c.name) {
      throw c;
    }
    return c.aa;
  }
}, fd_read:function(a, b, c, d) {
  try {
    a: {
      var e = Xb(a);
      a = b;
      for (var f, g = b = 0; g < c; g++) {
        var k = F[a >> 2], p = F[a + 4 >> 2];
        a += 8;
        var n = e, t = f, x = z;
        if (0 > p || 0 > t) {
          throw new N(28);
        }
        if (null === n.X) {
          throw new N(8);
        }
        if (1 === (n.flags & 2097155)) {
          throw new N(8);
        }
        if (16384 === (n.node.mode & 61440)) {
          throw new N(31);
        }
        if (!n.m.read) {
          throw new N(28);
        }
        var y = "undefined" != typeof t;
        if (!y) {
          t = n.position;
        } else if (!n.seekable) {
          throw new N(70);
        }
        var m = n.m.read(n, x, k, p, t);
        y || (n.position += m);
        var u = m;
        if (0 > u) {
          var r = -1;
          break a;
        }
        b += u;
        if (u < p) {
          break;
        }
        "undefined" != typeof f && (f += u);
      }
      r = b;
    }
    F[d >> 2] = r;
    return 0;
  } catch (D) {
    if ("undefined" == typeof pc || "ErrnoError" !== D.name) {
      throw D;
    }
    return D.aa;
  }
}, fd_seek:function(a, b, c, d, e) {
  b = c + 2097152 >>> 0 < 4194305 - !!b ? (b >>> 0) + 4294967296 * c : NaN;
  try {
    if (isNaN(b)) {
      return 61;
    }
    var f = Xb(a);
    lc(f, b, d);
    ab = [f.position >>> 0, ($a = f.position, 1.0 <= +Math.abs($a) ? 0.0 < $a ? +Math.floor($a / 4294967296.0) >>> 0 : ~~+Math.ceil(($a - +(~~$a >>> 0)) / 4294967296.0) >>> 0 : 0)];
    C[e >> 2] = ab[0];
    C[e + 4 >> 2] = ab[1];
    f.La && 0 === b && 0 === d && (f.La = null);
    return 0;
  } catch (g) {
    if ("undefined" == typeof pc || "ErrnoError" !== g.name) {
      throw g;
    }
    return g.aa;
  }
}, fd_write:function(a, b, c, d) {
  try {
    a: {
      var e = Xb(a);
      a = b;
      for (var f, g = b = 0; g < c; g++) {
        var k = F[a >> 2], p = F[a + 4 >> 2];
        a += 8;
        var n = e, t = k, x = p, y = f, m = z;
        if (0 > x || 0 > y) {
          throw new N(28);
        }
        if (null === n.X) {
          throw new N(8);
        }
        if (0 === (n.flags & 2097155)) {
          throw new N(8);
        }
        if (16384 === (n.node.mode & 61440)) {
          throw new N(31);
        }
        if (!n.m.write) {
          throw new N(28);
        }
        n.seekable && n.flags & 1024 && lc(n, 0, 2);
        var u = "undefined" != typeof y;
        if (!u) {
          y = n.position;
        } else if (!n.seekable) {
          throw new N(70);
        }
        var r = n.m.write(n, m, t, x, y, void 0);
        u || (n.position += r);
        var D = r;
        if (0 > D) {
          var I = -1;
          break a;
        }
        b += D;
        "undefined" != typeof f && (f += D);
      }
      I = b;
    }
    F[d >> 2] = I;
    return 0;
  } catch (w) {
    if ("undefined" == typeof pc || "ErrnoError" !== w.name) {
      throw w;
    }
    return w.aa;
  }
}, invoke_vii:de, isWindowsBrowser:function() {
  return -1 < navigator.platform.indexOf("Win");
}, strftime:$d, strftime_l:(a, b, c, d) => $d(a, b, c, d), wasm_start_image_decode:function(a, b, c) {
  b = l.HEAP8.subarray(b, b + c);
  c = new Uint8Array(c);
  c.set(b);
  createImageBitmap(new Blob([c])).then(function(d) {
    var e = (new OffscreenCanvas(d.width, d.height)).getContext("2d");
    e.drawImage(d, 0, 0);
    e = e.getImageData(0, 0, d.width, d.height);
    var f = e.data.length, g = l.Fb(f);
    l.wc.set(e.data, g);
    l.yc(a, d.width, d.height, g, f);
  }).catch(function(d) {
    d = d.message || "decode failed";
    var e = l.Pc(d) + 1, f = l.Fb(e);
    l.Uc(d, f, e);
    l.zc(a, f);
    l.xc(f);
  });
}}, Z = function() {
  function a(c) {
    Z = c.exports;
    Da = Z.memory;
    La();
    kd = Z.__indirect_function_table;
    Na.unshift(Z.__wasm_call_ctors);
    Qa--;
    l.monitorRunDependencies?.(Qa);
    0 == Qa && (null !== Ra && (clearInterval(Ra), Ra = null), Sa && (c = Sa, Sa = null, c()));
    return Z;
  }
  var b = {env:ee, wasi_snapshot_preview1:ee,};
  Qa++;
  l.monitorRunDependencies?.(Qa);
  if (l.instantiateWasm) {
    try {
      return l.instantiateWasm(b, a);
    } catch (c) {
      Ba(`Module.instantiateWasm callback failed with error: ${c}`), da(c);
    }
  }
  Va ||= Ua("canvas_advanced.wasm") ? "canvas_advanced.wasm" : l.locateFile ? l.locateFile("canvas_advanced.wasm", ua) : ua + "canvas_advanced.wasm";
  Za(b, function(c) {
    a(c.instance);
  }).catch(da);
  return {};
}(), Ec = a => (Ec = Z.free)(a), ce = a => (ce = Z.malloc)(a), Dc = a => (Dc = Z.__getTypeName)(a);
l._wasm_image_decode_complete = (a, b, c, d, e) => (l._wasm_image_decode_complete = Z.wasm_image_decode_complete)(a, b, c, d, e);
l._wasm_image_decode_error = (a, b) => (l._wasm_image_decode_error = Z.wasm_image_decode_error)(a, b);
var bb = l._ma_device__on_notification_unlocked = a => (bb = l._ma_device__on_notification_unlocked = Z.ma_device__on_notification_unlocked)(a);
l._ma_malloc_emscripten = (a, b) => (l._ma_malloc_emscripten = Z.ma_malloc_emscripten)(a, b);
l._ma_free_emscripten = (a, b) => (l._ma_free_emscripten = Z.ma_free_emscripten)(a, b);
var cb = l._ma_device_process_pcm_frames_capture__webaudio = (a, b, c) => (cb = l._ma_device_process_pcm_frames_capture__webaudio = Z.ma_device_process_pcm_frames_capture__webaudio)(a, b, c), db = l._ma_device_process_pcm_frames_playback__webaudio = (a, b, c) => (db = l._ma_device_process_pcm_frames_playback__webaudio = Z.ma_device_process_pcm_frames_playback__webaudio)(a, b, c), fe = (a, b) => (fe = Z.setThrew)(a, b), ge = a => (ge = Z._emscripten_stack_restore)(a), he = () => (he = Z.emscripten_stack_get_current)();
l.dynCall_iiji = (a, b, c, d, e) => (l.dynCall_iiji = Z.dynCall_iiji)(a, b, c, d, e);
l.dynCall_jiji = (a, b, c, d, e) => (l.dynCall_jiji = Z.dynCall_jiji)(a, b, c, d, e);
l.dynCall_iiiji = (a, b, c, d, e, f) => (l.dynCall_iiiji = Z.dynCall_iiiji)(a, b, c, d, e, f);
l.dynCall_iij = (a, b, c, d) => (l.dynCall_iij = Z.dynCall_iij)(a, b, c, d);
l.dynCall_jii = (a, b, c) => (l.dynCall_jii = Z.dynCall_jii)(a, b, c);
l.dynCall_viijii = (a, b, c, d, e, f, g) => (l.dynCall_viijii = Z.dynCall_viijii)(a, b, c, d, e, f, g);
l.dynCall_iiiiij = (a, b, c, d, e, f, g) => (l.dynCall_iiiiij = Z.dynCall_iiiiij)(a, b, c, d, e, f, g);
l.dynCall_iiiiijj = (a, b, c, d, e, f, g, k, p) => (l.dynCall_iiiiijj = Z.dynCall_iiiiijj)(a, b, c, d, e, f, g, k, p);
l.dynCall_iiiiiijj = (a, b, c, d, e, f, g, k, p, n) => (l.dynCall_iiiiiijj = Z.dynCall_iiiiiijj)(a, b, c, d, e, f, g, k, p, n);
function de(a, b, c) {
  var d = he();
  try {
    ld(a)(b, c);
  } catch (e) {
    ge(d);
    if (e !== e + 0) {
      throw e;
    }
    fe(1, 0);
  }
}
var ie;
Sa = function je() {
  ie || ke();
  ie || (Sa = je);
};
function ke() {
  function a() {
    if (!ie && (ie = !0, l.calledRun = !0, !Ea)) {
      l.noFSInit || mc || (mc = !0, l.stdin = l.stdin, l.stdout = l.stdout, l.stderr = l.stderr, l.stdin ? nc("stdin", l.stdin) : ic("/dev/tty", "/dev/stdin"), l.stdout ? nc("stdout", null, l.stdout) : ic("/dev/tty", "/dev/stdout"), l.stderr ? nc("stderr", null, l.stderr) : ic("/dev/tty1", "/dev/stderr"), jc("/dev/stdin", 0), jc("/dev/stdout", 1), jc("/dev/stderr", 1));
      Nb = !1;
      fb(Na);
      ca(l);
      if (l.onRuntimeInitialized) {
        l.onRuntimeInitialized();
      }
      if (l.postRun) {
        for ("function" == typeof l.postRun && (l.postRun = [l.postRun]); l.postRun.length;) {
          var b = l.postRun.shift();
          Oa.unshift(b);
        }
      }
      fb(Oa);
    }
  }
  if (!(0 < Qa)) {
    if (l.preRun) {
      for ("function" == typeof l.preRun && (l.preRun = [l.preRun]); l.preRun.length;) {
        Pa();
      }
    }
    fb(Ma);
    0 < Qa || (l.setStatus ? (l.setStatus("Running..."), setTimeout(function() {
      setTimeout(function() {
        l.setStatus("");
      }, 1);
      a();
    }, 1)) : a());
  }
}
if (l.preInit) {
  for ("function" == typeof l.preInit && (l.preInit = [l.preInit]); 0 < l.preInit.length;) {
    l.preInit.pop()();
  }
}
ke();
moduleRtn = ea;



  return moduleRtn;
}
);
})();
export default Rive;
