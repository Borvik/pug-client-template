'use strict';

const pug = require('pug');
const pugRuntimeSources = require('pug-runtime/lib/sources');
const codeGen = require('pug-code-gen');
const pug_walk = require('pug-walk');

// stores template functions for the current run
let templateCache = {},
    compileOptions = null,
    compile_level = 0,
    outputServerHelpers = true;

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
      },
      postCodeGen: function(js) {
        return js;
      }
    });
  }

  handleLexClientTemplate(lexer) {
    // let token = lexer.scan(/^pugtemplate(?=\(| |$|\n)/, 'pugtemplate');
    // if (token) {
    //   lexer.tokens.push(token);
    //   lexer.callLexerFunction('attrs');
    //   lexer.interpolationAllowed = false;
    //   lexer.callLexerFunction('pipelessText');
    //   return true;
    // }

    let token = lexer.scan(/^pugruntime(?=\(| |$|\n)/, 'pugruntime');
    if (token) {
      lexer.tokens.push(token);
      return true; 
    }

    let captures;
    if (captures = /^pugtemplate +([-\w]+\.?[-\w]+)(?: *\((.*)\))? */.exec(lexer.input)) {
      lexer.consume(captures[0].length);
      let tok = lexer.tok('pugtemplate', captures[1]);
      tok.args = captures[2] || null;
      lexer.tokens.push(tok);
      return true;
    }
  }

  preLoad(ast, options) {
    ast = JSON.parse(JSON.stringify(ast));
    return pug_walk(ast, function before(node, replace) {
      let o = node;
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
    // let block, attrs = [];

    // if (parser.peek().type === 'start-attributes') {
    //   attrs = parser.attrs();
    // }

    // let nameAttr = attrs.find(attr => attr.name === 'name');
    // let objAttr = attrs.find(attr => attr.name === 'obj');
    // let dataAttr = attrs.find(attr => attr.name === 'data');
    // if (!nameAttr) {
    //   parser.error('INVALID_TOKEN', 'Missing "name" attribute on pugtemplate', tok);
    // }
    // if (!objAttr) {
    //   objAttr = {val: "'templates'"};
    // }
    
    // let objectName = objAttr.val.substring(1, objAttr.val.length - 1);
    // let templateName = nameAttr.val.substring(1, nameAttr.val.length - 1);

    // if (templateName && dataAttr) {
    //   if (!templateCache.hasOwnProperty(templateName))
    //     parser.error('INVALID_TOKEN', 'PugTemplate "' + templateName + '" has not been defined', tok);
        
    //   return {
    //     type: 'Text',
    //     pugtemplate: true,
    //     func: templateName,
    //     data: dataAttr.val,
    //     line: tok.line,
    //     column: tok.col,
    //     filename: parser.filename
    //   };
    // }

    // if (templateCache.hasOwnProperty(templateName)) {
    //   parser.error('INVALID_TOKEN', 'PugTemplate "' + templateName + '" has already been defined', tok);
    // }

    // block = parser.parseTextBlock() || parser.emptyBlock(tok.line);
    // let templateText = block.nodes.map(function(node) { return node.val; }).join('');
    
    // let fnBody = pug.compileClient(templateText, {
    //   compileDebug: false,
    //   inlineRuntimeFunctions: false,
    //   name: templateName,
    //   filename: parser.filename,
    //   pretty: compileOptions.pretty,
    //   globals: compileOptions.globals,
    //   self: compileOptions.self,
    //   filters: compileOptions.filters,
    //   filterOptions: compileOptions.filterOptions,
    //   filterAliases: compileOptions.filterAliases,
    //   plugins: compileOptions.plugins
    // });

    // templateCache[templateName] = {fn: fnBody, obj: objectName, server: false};

    // let templateFunction = 'if(!window.' + objectName + '){window.' + objectName + '={};}' +
    //   'window.' + objectName + '.' + templateName + '=pug_interp=' + fnBody;
    
    // return {
    //   type: 'Tag',
    //   name: 'script',
    //   selfClosing: false,
    //   block: {
    //     type: 'Block',
    //     nodes: [{
    //       type: 'Text',
    //       val: templateFunction,
    //       line: tok.line,
    //       column: tok.col,
    //       filename: parser.filename
    //     }],
    //     line: tok.line,
    //     filename: parser.filename
    //   },
    //   attrs: [],
    //   attributeBlocks: [],
    //   isInline: false,
    //   line: tok.line,
    //   filename: parser.filename
    // };
  }
}

let pug_compile = pug.compile;
pug.compile = function(str, options) {
  if (!compile_level) compileOptions = options || {};
  compile_level++;

  let err = null, result = null;

  try {
    result = pug_compile.call(pug, str, options);
  } catch(error) {
    err = error;
  }

  compile_level--;
  if (!compile_level) {
    compileOptions = null;
    templateCache = {};
  }

  if (err) throw err;
  return result;
};

let pug_compileClientWithDependenciesTracked = pug.compileClientWithDependenciesTracked;
pug.compileClientWithDependenciesTracked = function(str, options) {
  if (!compile_level) compileOptions = options || {};
  compile_level++;

  let err = null, result = null;

  try {
    result = pug_compileClientWithDependenciesTracked(str, options);
  } catch (error) {
    err = error;
  }

  compile_level--;
  if (!compile_level) {
    compileOptions = null;
    templateCache = {};
  }

  if (err) throw err;
  return result;
};


let origVisit = codeGen.CodeGenerator.prototype.visit;
codeGen.CodeGenerator.prototype.visit = function(node, parent) {
  if (node && node.type && node.type !== 'Block' && compile_level === 1 && outputServerHelpers) {
    console.log('VISIT ON SERVER');
    outputServerHelpers = false;
    
    let js = ';var pug_pct_tmpl={}';
    for (let fnName in templateCache) {
      if (!templateCache.hasOwnProperty(fnName)) continue;
      js += ';pug_pct_tmpl.' + fnName + '=pug_interp=' + templateCache[fnName].fn;
      templateCache[fnName].server = true;
    }
    if (js !== ';var pug_pct_tmpl={}')
      this.buf.push(js + ';');
  }
  origVisit.call(this, node, parent);
};

let origVisitText = codeGen.CodeGenerator.prototype.visitText;
codeGen.CodeGenerator.prototype.visitText = function(node) {
  if (!node.hasOwnProperty('pugtemplate')) {
    origVisitText.call(this, node);
    return;
  }
  if (node.pugtemplate === false) return;

  let func = templateCache[node.func];
  if (!func.server) {
    // generate function
  }
  console.log(node.func + ' generated for SERVER');
  //let exp = '(function(argData) {' + func.fn + ';return ' + node.func + '(argData);})' + '(' + node.data + ')';
  //let exp = 'pug.pct_tmpl.' + node.func + '(' + node.data + ')';
  let exp = '(function(argData){return pug_pct_tmpl.'+node.func+'(argData);})(' + node.data + ')';
  this.bufferExpression(exp);
};

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

  if (!this.pug_template_objects) {
    this.pug_template_objects = [];
  }
  // let templateFunction = 'if(!window.' + objectName + '){window.' + objectName + '={};}' +
  //   'window.' + objectName + '.' + templateName + '=pug_interp=' + fnBody;
  let args = mixin.args || '';
  let block = mixin.block;

  args = args ? args.split(',') : [];
  let rest = false;
  if (args.length && /^\.\.\./.test(args[args.length - 1].trim())) {
    rest = args.pop().trim().replace(/^\.\.\./, '');
  }

  this.buffer('<script>(function(){');
  if (this.pug_template_objects.indexOf(objectName) < 0) {
    this.pug_template_objects.push(objectName);
    this.buffer('if(!window.' + objectName + '){window.' + objectName + '={};}');
  }
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
  this.visit(block, mixin);
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

let window = {}, pug_interp = null;
(function() {
  if(!window.templates){window.templates={};}
  window.templates.name = pug_interp = function() {

  };
})();

module.exports = PugClientTemplate.init();