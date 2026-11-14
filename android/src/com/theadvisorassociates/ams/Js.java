package com.theadvisorassociates.ams;

/** Small scripts run in the page so browser-only features work in the app. */
final class Js {
    private Js() { }

    /** Hands a blob / data URL (a PDF made in the page) to the app, which saves it in Downloads. */
    static String saveBlob(String url, String name) {
        return "(function(u,n){" + SAVE + "window.__amsSave(u,n);})(" + q(url) + "," + q(name) + ");";
    }

    private static final String SAVE =
        "if(!window.__amsSave){window.__amsSave=function(u,n){"
      + "fetch(u).then(function(r){return r.blob();}).then(function(b){"
      + "var fr=new FileReader();fr.onloadend=function(){var s=String(fr.result);"
      + "AMSApp.save(s.substring(s.indexOf(',')+1),b.type||'application/octet-stream',n||('AMS-'+Date.now()+(b.type==='application/pdf'?'.pdf':'')));};"
      + "fr.readAsDataURL(b);}).catch(function(){alert('Could not save the file');});};}";

    /**
     * Run after every page load: Print uses Android printing, and "Download" links for files made in the page
     * (blob: links with a download name, e.g. Download PDF) are saved by the app with their proper name.
     */
    static final String HOOKS =
        "(function(){if(window.__amsHooks)return;window.__amsHooks=1;" + SAVE
      + "window.print=function(){AMSApp.print(document.title||'AMS');};"
      + "var isFile=function(a){return a&&a.href&&a.hasAttribute&&a.hasAttribute('download')&&/^(blob|data):/.test(a.href);};"
      + "var click=HTMLAnchorElement.prototype.click;"
      + "HTMLAnchorElement.prototype.click=function(){if(isFile(this)){window.__amsSave(this.href,this.getAttribute('download'));return;}return click.apply(this,arguments);};"
      + "var send=EventTarget.prototype.dispatchEvent;"
      + "EventTarget.prototype.dispatchEvent=function(e){if(e&&e.type==='click'&&this instanceof HTMLAnchorElement&&isFile(this)){window.__amsSave(this.href,this.getAttribute('download'));return false;}return send.apply(this,arguments);};"
      + "document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a'):null;if(isFile(a)){e.preventDefault();window.__amsSave(a.href,a.getAttribute('download'));}},true);"
      + "})();";

    private static String q(String s) {
        StringBuilder b = new StringBuilder("'");
        for (char c : s.toCharArray()) {
            if (c == '\'' || c == '\\') b.append('\\').append(c);
            else if (c < 32) b.append(' ');
            else b.append(c);
        }
        return b.append('\'').toString();
    }
}
