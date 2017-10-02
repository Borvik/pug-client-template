# pug-client-template
Node middleware to allow parts of the pug template to be passed on and used in the browser.

This enables two new tags for pug files `pugruntime` and `pugtemplate`.

* `pugruntime` - Outputs the pug runtime functions to the object `window.pug` (created by the tag).
* `pugtemplate` - Outputs the block below it as a template function usable by client-side javascript.

The `pugtemplate` tag has some special attributes.

* `name` - Required. This will be the name of the function that can be called by the client-side javascript.
* `obj` - Optional. This is the name of the template object that will hold the functions.  If not specified, "templates" will be used.
* `data` - Optional. The data to pass to the template for immediate output.

# Installation

```
npm install pug-client-template
```

# Example
```pug
body
  #templateResult
  pugtemplate(name='my_template',obj='tmpls')
    .my-template #{testVar}
  pugtemplate(name='my_template',data=varPassedIn)
  pugruntime
  script.
    $(function() {
      $('#templateResult').html(tmpls.my_template({testVar: 'Working'}));
    });
```
Abbreviated output
```html
<body>
  <div id="templateResult"></div>
  <div class="my-template">{value of varPassedIn.testVar}</div>
  <script>
    if (!window.tmpls) {
      window.tmpls = {};
    }
    window.tmpls.my_template = function my_template(locals) {
      /* this is the compiled template function */
    }
  </script>
  <script>
    (function() {
      window.pug = {};
      function pug_attrs(t,r) {/* a pug runtime function - there are more than one */}
      window.pug.attrs = pug_attrs;
    })();
  </script>
  <script>
    $(function() {
      $('#templateResult').html(tmpls.my_template({testVar: 'Working'}));
    });
  </script>
</body>
```