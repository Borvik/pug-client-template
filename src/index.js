'use strict';

const pugRuntimeSources = require('pug-runtime/lib/sources');
const codeGen = require('pug-code-gen');
const pug_walk = require('pug-walk');

let warnedNamespaceDeprecation = false;

class PugClientTemplate {

  static init() {
    let self = new PugClientTemplate();
    return (req, res, next) => {
      self.register(res);
      next();
    };
  }

  register(res) {
    let self = this;

    if (typeof res.locals.plugins !== 'undefined' && !Array.isArray(res.locals.plugins)) {
      throw new Error('res.locals.plugins is already in use - perhaps by a different node module');
    }

    if (typeof res.locals.plugins === 'undefined') {
      res.locals.plugins = [];
    }

    res.locals.plugins.push({
      lex: { include: self.handleLexClientTemplate },
      preLoad: self.preLoad,
      parse: {
        expressionTokens: {
          "pugtemplate": function(parser) { return self.parseClientTemplate(parser); },
          "pugruntime": function(parser) { return self.parsePugRuntime(parser); }
        }
      }
    });
  }

  handleLexClientTemplate(lexer) {
    let token = lexer.scan(/^pugruntime(?=\(| |$|\n)/, 'pugruntime');
    if (token) {
      lexer.tokens.push(token);
      return true; 
    }

    let cp = /^pugtemplate +([-\w]+)(?: *\((.*)\))? */.exec(lexer.input);
    let captures = /^pugtemplate +([-\w]+\.?[-\w]+)(?: *\((.*)\))? */.exec(lexer.input);
    if (captures) {
      if (!warnedNamespaceDeprecation && captures[1].indexOf('.') >= 0) {
        warnedNamespaceDeprecation = true;
        console.warn(
          `${lexer.filename}, line ${lexer.lineno}:${lexer.colno} - PugTemplate namespaces are deprecated and will be removed in a future version.`
        );
      }
      lexer.consume(captures[0].length);
      let tok = lexer.tok('pugtemplate', captures[1]);
      tok.args = captures[2] || null;
      lexer.tokens.push(tok);
      return true;
    }
  }

  preLoad(ast) {
    ast = JSON.parse(JSON.stringify(ast));
    return pug_walk(ast, function before(node) {
      if (node.type === 'PugTemplate') {
        node.type = 'Mixin';
        node.pugtemplate = true;
        return false;
      }
    });
  }

  parsePugRuntime(parser) {
    let tok = parser.expect('pugruntime');
    
    let runtime = '(function(){window.pug={};';
    let propNames = Object.getOwnPropertyNames(pugRuntimeSources);
    propNames.sort().forEach(name => {
      if (name === 'rethrow') return;
      runtime += pugRuntimeSources[name];
      runtime += 'window.pug.' + name + '=' + 'pug_' + name + ';';
    });
    runtime += '})();';
    
    return {
      type: 'Tag',
      name: 'script',
      selfClosing: false,
      block: {
        type: 'Block',
        nodes: [{
          type: 'Text',
          val: runtime,
          line: tok.line,
          column: tok.col,
          filename: parser.filename
        }],
        line: tok.line,
        filename: parser.filename
      },
      attrs: [],
      attributeBlocks: [],
      isInline: false,
      line: tok.line,
      filename: parser.filename
    };
  }

  parseClientTemplate(parser) {
    let tok = parser.expect('pugtemplate');
    let name = tok.val;
    let args = tok.args;
    
    if ('indent' !== parser.peek().type) {
      parser.error('MIXIN_WITHOUT_BODY', 'PugTemplate ' + name + ' declared without body', tok);
    }

    parser.inMixin++;
    let template = {
      type: 'PugTemplate',
      name: name,
      args: args,
      block: parser.block(),
      line: tok.line,
      filename: parser.filename
    };
    parser.inMixin--;
    return template;
  }
}

let origVisitMixin = codeGen.CodeGenerator.prototype.visitMixin;
codeGen.CodeGenerator.prototype.visitMixin = function(mixin) {
  if (!mixin.hasOwnProperty('pugtemplate')) {
    origVisitMixin.call(this, mixin);
    return;
  }

  let objectName = 'templates';
  let templateName = mixin.name;
  mixin.name = templateName.replace(/\./g, '_');
  origVisitMixin.call(this, mixin);

  if (templateName.indexOf('.') > -1) {
    let names = templateName.split('.');
    objectName = names[0];
    templateName = names[1];
  }

  let args = mixin.args || '';
  let block = mixin.block;

  args = args ? args.split(',') : [];
  let rest = false;
  if (args.length && /^\.\.\./.test(args[args.length - 1].trim())) {
    rest = args.pop().trim().replace(/^\.\.\./, '');
  }

  this.buffer('<script>(function(){');
  this.buffer('if(!window.' + objectName + '){window.' + objectName + '={};}');
  this.buffer('window.' + objectName + '.' + templateName + ' = pug_interp = function(' + args.join(',') + '){');
  if (rest) {
    this.buffer('var ' + rest + ' = [];');
    this.buffer('for (pug_interp = ' + args.length + '; pug_interp < arguments.length; pug_interp++) {');
    this.buffer('  ' + rest + '.push(arguments[pug_interp]);');
    this.buffer('}');
  }
  this.buffer('var pug_html = "", pug_interp;');
  let bufferLength = this.buf.length;
  this.parentIndents++;
  let origDebug = this.debug;
  this.debug = true;
  this.visit(block, mixin);
  this.debug = origDebug;
  this.parentIndents--;
  let realBuffer = [];
  while(this.buf.length > bufferLength) {
    realBuffer.unshift(this.buf.pop());
  }
  while(realBuffer.length) {
    let line = realBuffer.shift();
    if (line.substr(0, 17) === ';pug_debug_line =')
      continue;
    this.buffer(line);
  }
  this.buffer('return pug_html;};');
  this.buffer('})();</script>');
};

module.exports = PugClientTemplate.init();