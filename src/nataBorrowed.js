/**
 * © Copyright IBM Corp. 2016, 2018 All Rights Reserved
 *   Project name: JSONata
 *   This project is licensed under the MIT License, see LICENSE
 */

var utils = require('./utils');
var dateTime = require('./datetime');

const nataBorrowed = (() => {
    'use strict';

    var createSequence = utils.createSequence;
    var isFunction = utils.isFunction;
    var isPromise = utils.isPromise;

    var formatInteger = dateTime.formatInteger;
    var round = dateTime.round;
    var fromMillis = dateTime.fromMillis;
    var millis = dateTime.millis;
    var toMillis = dateTime.toMillis;

    /**
     * Evaluate the matcher function against the str arg
     *
     * @param {*} matcher - matching function (native or lambda)
     * @param {string} str - the string to match against
     * @returns {object} - structure that represents the match(es)
     */
    async function evaluateMatcher(matcher, str) {
	var result = matcher.apply(this, [str]); // eslint-disable-line no-useless-call
	if(isPromise(result)) {
	    result = await result;
	}
	if(result && !(typeof result.start === 'number' || result.end === 'number' || Array.isArray(result.groups) || isFunction(result.next))) {
	    // the matcher function didn't return the correct structure
	    throw {
		code: "T1010",
		stack: (new Error()).stack,
	    };
	}
	return result;
    }

    /**
     * Match a string with a regex returning an array of object containing details of each match
     * @param {String} str - string
     * @param {String} regex - the regex applied to the string
     * @param {Integer} [limit] - max number of matches to return
     * @returns {Array} The array of match objects
     */
    async function match(str, regex, limit) {
	// undefined inputs always return undefined
	if (typeof str === 'undefined') {
	    return undefined;
	}

	// limit, if specified, must be a non-negative number
	if (limit < 0) {
	    throw {
		stack: (new Error()).stack,
		value: limit,
		code: 'D3040',
		index: 3
	    };
	}

	var result = createSequence();

	if (typeof limit === 'undefined' || limit > 0) {
	    var count = 0;
	    var matches = await evaluateMatcher(regex, str);
	    if (typeof matches !== 'undefined') {
		while (typeof matches !== 'undefined' && (typeof limit === 'undefined' || count < limit)) {
		    result.push({
			match: matches.match,
			index: matches.start,
			groups: matches.groups
		    });
		    matches = await evaluateMatcher(matches.next);
		    count++;
		}
	    }
	}

	return result;
    }

    /**
     * Base64 encode a string
     * @param {String} str - string
     * @returns {String} Base 64 encoding of the binary data
     */
    function base64encode(str) {
	// undefined inputs always return undefined
	if (typeof str === 'undefined') {
	    return undefined;
	}
	// Use btoa in a browser, or Buffer in Node.js

	var btoa = typeof window !== 'undefined' ?
	    /* istanbul ignore next */ window.btoa :
	    function (str) {
		// Simply doing `new Buffer` at this point causes Browserify to pull
		// in the entire Buffer browser library, which is large and unnecessary.
		// Using `global.Buffer` defeats this.
		return new global.Buffer.from(str, 'binary').toString('base64'); // eslint-disable-line new-cap
	    };
	return btoa(str);
    }

    /**
     * Base64 decode a string
     * @param {String} str - string
     * @returns {String} Base 64 encoding of the binary data
     */
    function base64decode(str) {
	// undefined inputs always return undefined
	if (typeof str === 'undefined') {
	    return undefined;
	}
	// Use btoa in a browser, or Buffer in Node.js
	var atob = typeof window !== 'undefined' ?
	    /* istanbul ignore next */ window.atob :
	    function (str) {
		// Simply doing `new Buffer` at this point causes Browserify to pull
		// in the entire Buffer browser library, which is large and unnecessary.
		// Using `global.Buffer` defeats this.
		return new global.Buffer.from(str, 'base64').toString('binary'); // eslint-disable-line new-cap
	    };
	return atob(str);
    }

    /**
     * Formats a number into a decimal string representation using XPath 3.1 F&O fn:format-number spec
     * @param {number} value - number to format
     * @param {String} picture - picture string definition
     * @param {Object} [options] - override locale defaults
     * @returns {String} The formatted string
     */
    function formatNumber(value, picture, options) {
	// undefined inputs always return undefined
	if (typeof value === 'undefined') {
	    return undefined;
	}

	var defaults = {
	    "decimal-separator": ".",
	    "grouping-separator": ",",
	    "exponent-separator": "e",
	    "infinity": "Infinity",
	    "minus-sign": "-",
	    "NaN": "NaN",
	    "percent": "%",
	    "per-mille": "\u2030",
	    "zero-digit": "0",
	    "digit": "#",
	    "pattern-separator": ";"
	};

	// if `options` is specified, then its entries override defaults
	var properties = defaults;
	if (typeof options !== 'undefined') {
	    Object.keys(options).forEach(function (key) {
		properties[key] = options[key];
	    });
	}

	var decimalDigitFamily = [];
	var zeroCharCode = properties['zero-digit'].charCodeAt(0);
	for (var ii = zeroCharCode; ii < zeroCharCode + 10; ii++) {
	    decimalDigitFamily.push(String.fromCharCode(ii));
	}

	var activeChars = decimalDigitFamily.concat([properties['decimal-separator'], properties['exponent-separator'], properties['grouping-separator'], properties.digit, properties['pattern-separator']]);

	var subPictures = picture.split(properties['pattern-separator']);

	if (subPictures.length > 2) {
	    throw {
		code: 'D3080',
		stack: (new Error()).stack
	    };
	}

	var splitParts = function (subpicture) {
	    var prefix = (function () {
		var ch;
		for (var ii = 0; ii < subpicture.length; ii++) {
		    ch = subpicture.charAt(ii);
		    if (activeChars.indexOf(ch) !== -1 && ch !== properties['exponent-separator']) {
			return subpicture.substring(0, ii);
		    }
		}
	    })();
	    var suffix = (function () {
		var ch;
		for (var ii = subpicture.length - 1; ii >= 0; ii--) {
		    ch = subpicture.charAt(ii);
		    if (activeChars.indexOf(ch) !== -1 && ch !== properties['exponent-separator']) {
			return subpicture.substring(ii + 1);
		    }
		}
	    })();
	    var activePart = subpicture.substring(prefix.length, subpicture.length - suffix.length);
	    var mantissaPart, exponentPart, integerPart, fractionalPart;
	    var exponentPosition = subpicture.indexOf(properties['exponent-separator'], prefix.length);
	    if (exponentPosition === -1 || exponentPosition > subpicture.length - suffix.length) {
		mantissaPart = activePart;
		exponentPart = undefined;
	    } else {
		mantissaPart = activePart.substring(0, exponentPosition);
		exponentPart = activePart.substring(exponentPosition + 1);
	    }
	    var decimalPosition = mantissaPart.indexOf(properties['decimal-separator']);
	    if (decimalPosition === -1) {
		integerPart = mantissaPart;
		fractionalPart = suffix;
	    } else {
		integerPart = mantissaPart.substring(0, decimalPosition);
		fractionalPart = mantissaPart.substring(decimalPosition + 1);
	    }
	    return {
		prefix: prefix,
		suffix: suffix,
		activePart: activePart,
		mantissaPart: mantissaPart,
		exponentPart: exponentPart,
		integerPart: integerPart,
		fractionalPart: fractionalPart,
		subpicture: subpicture
	    };
	};

	// validate the picture string, F&O 4.7.3
	var validate = function (parts) {
	    var error;
	    var ii;
	    var subpicture = parts.subpicture;
	    var decimalPos = subpicture.indexOf(properties['decimal-separator']);
	    if (decimalPos !== subpicture.lastIndexOf(properties['decimal-separator'])) {
		error = 'D3081';
	    }
	    if (subpicture.indexOf(properties.percent) !== subpicture.lastIndexOf(properties.percent)) {
		error = 'D3082';
	    }
	    if (subpicture.indexOf(properties['per-mille']) !== subpicture.lastIndexOf(properties['per-mille'])) {
		error = 'D3083';
	    }
	    if (subpicture.indexOf(properties.percent) !== -1 && subpicture.indexOf(properties['per-mille']) !== -1) {
		error = 'D3084';
	    }
	    var valid = false;
	    for (ii = 0; ii < parts.mantissaPart.length; ii++) {
		var ch = parts.mantissaPart.charAt(ii);
		if (decimalDigitFamily.indexOf(ch) !== -1 || ch === properties.digit) {
		    valid = true;
		    break;
		}
	    }
	    if (!valid) {
		error = 'D3085';
	    }
	    var charTypes = parts.activePart.split('').map(function (char) {
		return activeChars.indexOf(char) === -1 ? 'p' : 'a';
	    }).join('');
	    if (charTypes.indexOf('p') !== -1) {
		error = 'D3086';
	    }
	    if (decimalPos !== -1) {
		if (subpicture.charAt(decimalPos - 1) === properties['grouping-separator'] || subpicture.charAt(decimalPos + 1) === properties['grouping-separator']) {
		    error = 'D3087';
		}
	    } else if (parts.integerPart.charAt(parts.integerPart.length - 1) === properties['grouping-separator']) {
		error = 'D3088';
	    }
	    if (subpicture.indexOf(properties['grouping-separator'] + properties['grouping-separator']) !== -1) {
		error = 'D3089';
	    }
	    var optionalDigitPos = parts.integerPart.indexOf(properties.digit);
	    if (optionalDigitPos !== -1 && parts.integerPart.substring(0, optionalDigitPos).split('').filter(function (char) {
		return decimalDigitFamily.indexOf(char) > -1;
	    }).length > 0) {
		error = 'D3090';
	    }
	    optionalDigitPos = parts.fractionalPart.lastIndexOf(properties.digit);
	    if (optionalDigitPos !== -1 && parts.fractionalPart.substring(optionalDigitPos).split('').filter(function (char) {
		return decimalDigitFamily.indexOf(char) > -1;
	    }).length > 0) {
		error = 'D3091';
	    }
	    var exponentExists = (typeof parts.exponentPart === 'string');
	    if (exponentExists && parts.exponentPart.length > 0 && (subpicture.indexOf(properties.percent) !== -1 || subpicture.indexOf(properties['per-mille']) !== -1)) {
		error = 'D3092';
	    }
	    if (exponentExists && (parts.exponentPart.length === 0 || parts.exponentPart.split('').filter(function (char) {
		return decimalDigitFamily.indexOf(char) === -1;
	    }).length > 0)) {
		error = 'D3093';
	    }
	    if (error) {
		throw {
		    code: error,
		    stack: (new Error()).stack
		};
	    }
	};

	// analyse the picture string, F&O 4.7.4
	var analyse = function (parts) {
	    var getGroupingPositions = function (part, toLeft) {
		var positions = [];
		var groupingPosition = part.indexOf(properties['grouping-separator']);
		while (groupingPosition !== -1) {
		    var charsToTheRight = (toLeft ? part.substring(0, groupingPosition) : part.substring(groupingPosition)).split('').filter(function (char) {
			return decimalDigitFamily.indexOf(char) !== -1 || char === properties.digit;
		    }).length;
		    positions.push(charsToTheRight);
		    groupingPosition = parts.integerPart.indexOf(properties['grouping-separator'], groupingPosition + 1);
		}
		return positions;
	    };
	    var integerPartGroupingPositions = getGroupingPositions(parts.integerPart);
	    var regular = function (indexes) {
		// are the grouping positions regular? i.e. same interval between each of them
		if (indexes.length === 0) {
		    return 0;
		}
		var gcd = function (a, b) {
		    return b === 0 ? a : gcd(b, a % b);
		};
		// find the greatest common divisor of all the positions
		var factor = indexes.reduce(gcd);
		// is every position separated by this divisor? If so, it's regular
		for (var index = 1; index <= indexes.length; index++) {
		    if (indexes.indexOf(index * factor) === -1) {
			return 0;
		    }
		}
		return factor;
	    };

	    var regularGrouping = regular(integerPartGroupingPositions);
	    var fractionalPartGroupingPositions = getGroupingPositions(parts.fractionalPart, true);

	    var minimumIntegerPartSize = parts.integerPart.split('').filter(function (char) {
		return decimalDigitFamily.indexOf(char) !== -1;
	    }).length;
	    var scalingFactor = minimumIntegerPartSize;

	    var fractionalPartArray = parts.fractionalPart.split('');
	    var minimumFactionalPartSize = fractionalPartArray.filter(function (char) {
		return decimalDigitFamily.indexOf(char) !== -1;
	    }).length;
	    var maximumFactionalPartSize = fractionalPartArray.filter(function (char) {
		return decimalDigitFamily.indexOf(char) !== -1 || char === properties.digit;
	    }).length;
	    var exponentPresent = typeof parts.exponentPart === 'string';
	    if (minimumIntegerPartSize === 0 && maximumFactionalPartSize === 0) {
		if (exponentPresent) {
		    minimumFactionalPartSize = 1;
		    maximumFactionalPartSize = 1;
		} else {
		    minimumIntegerPartSize = 1;
		}
	    }
	    if (exponentPresent && minimumIntegerPartSize === 0 && parts.integerPart.indexOf(properties.digit) !== -1) {
		minimumIntegerPartSize = 1;
	    }
	    if (minimumIntegerPartSize === 0 && minimumFactionalPartSize === 0) {
		minimumFactionalPartSize = 1;
	    }
	    var minimumExponentSize = 0;
	    if (exponentPresent) {
		minimumExponentSize = parts.exponentPart.split('').filter(function (char) {
		    return decimalDigitFamily.indexOf(char) !== -1;
		}).length;
	    }

	    return {
		integerPartGroupingPositions: integerPartGroupingPositions,
		regularGrouping: regularGrouping,
		minimumIntegerPartSize: minimumIntegerPartSize,
		scalingFactor: scalingFactor,
		prefix: parts.prefix,
		fractionalPartGroupingPositions: fractionalPartGroupingPositions,
		minimumFactionalPartSize: minimumFactionalPartSize,
		maximumFactionalPartSize: maximumFactionalPartSize,
		minimumExponentSize: minimumExponentSize,
		suffix: parts.suffix,
		picture: parts.subpicture
	    };
	};

	var parts = subPictures.map(splitParts);
	parts.forEach(validate);

	var variables = parts.map(analyse);

	var minus_sign = properties['minus-sign'];
	var zero_digit = properties['zero-digit'];
	var decimal_separator = properties['decimal-separator'];
	var grouping_separator = properties['grouping-separator'];

	if (variables.length === 1) {
	    variables.push(JSON.parse(JSON.stringify(variables[0])));
	    variables[1].prefix = minus_sign + variables[1].prefix;
	}

	// TODO cache the result of the analysis

	// format the number
	// bullet 1: TODO: NaN - not sure we'd ever get this in JSON
	var pic;
	// bullet 2:
	if (value >= 0) {
	    pic = variables[0];
	} else {
	    pic = variables[1];
	}
	var adjustedNumber;
	// bullet 3:
	if (pic.picture.indexOf(properties.percent) !== -1) {
	    adjustedNumber = value * 100;
	} else if (pic.picture.indexOf(properties['per-mille']) !== -1) {
	    adjustedNumber = value * 1000;
	} else {
	    adjustedNumber = value;
	}
	// bullet 4:
	// TODO: infinity - not sure we'd ever get this in JSON
	// bullet 5:
	var mantissa, exponent;
	if (pic.minimumExponentSize === 0) {
	    mantissa = adjustedNumber;
	} else {
	    // mantissa * 10^exponent = adjustedNumber
	    var maxMantissa = Math.pow(10, pic.scalingFactor);
	    var minMantissa = Math.pow(10, pic.scalingFactor - 1);
	    mantissa = adjustedNumber;
	    exponent = 0;
	    while (mantissa < minMantissa) {
		mantissa *= 10;
		exponent -= 1;
	    }
	    while (mantissa > maxMantissa) {
		mantissa /= 10;
		exponent += 1;
	    }
	}
	// bullet 6:
	var roundedNumber = round(mantissa, pic.maximumFactionalPartSize);
	// bullet 7:
	var makeString = function (value, dp) {
	    var str = Math.abs(value).toFixed(dp);
	    if (zero_digit !== '0') {
		str = str.split('').map(function (digit) {
		    if (digit >= '0' && digit <= '9') {
			return decimalDigitFamily[digit.charCodeAt(0) - 48];
		    } else {
			return digit;
		    }
		}).join('');
	    }
	    return str;
	};
	var stringValue = makeString(roundedNumber, pic.maximumFactionalPartSize);
	var decimalPos = stringValue.indexOf('.');
	if (decimalPos === -1) {
	    stringValue = stringValue + decimal_separator;
	} else {
	    stringValue = stringValue.replace('.', decimal_separator);
	}
	while (stringValue.charAt(0) === zero_digit) {
	    stringValue = stringValue.substring(1);
	}
	while (stringValue.charAt(stringValue.length - 1) === zero_digit) {
	    stringValue = stringValue.substring(0, stringValue.length - 1);
	}
	// bullets 8 & 9:
	decimalPos = stringValue.indexOf(decimal_separator);
	var padLeft = pic.minimumIntegerPartSize - decimalPos;
	var padRight = pic.minimumFactionalPartSize - (stringValue.length - decimalPos - 1);
	stringValue = (padLeft > 0 ? new Array(padLeft + 1).join(zero_digit) : '') + stringValue;
	stringValue = stringValue + (padRight > 0 ? new Array(padRight + 1).join(zero_digit) : '');
	decimalPos = stringValue.indexOf(decimal_separator);
	// bullet 10:
	if (pic.regularGrouping > 0) {
	    var groupCount = Math.floor((decimalPos - 1) / pic.regularGrouping);
	    for (var group = 1; group <= groupCount; group++) {
		stringValue = [stringValue.slice(0, decimalPos - group * pic.regularGrouping), grouping_separator, stringValue.slice(decimalPos - group * pic.regularGrouping)].join('');
	    }
	} else {
	    pic.integerPartGroupingPositions.forEach(function (pos) {
		stringValue = [stringValue.slice(0, decimalPos - pos), grouping_separator, stringValue.slice(decimalPos - pos)].join('');
		decimalPos++;
	    });
	}
	// bullet 11:
	decimalPos = stringValue.indexOf(decimal_separator);
	pic.fractionalPartGroupingPositions.forEach(function (pos) {
	    stringValue = [stringValue.slice(0, pos + decimalPos + 1), grouping_separator, stringValue.slice(pos + decimalPos + 1)].join('');
	});
	// bullet 12:
	decimalPos = stringValue.indexOf(decimal_separator);
	if (pic.picture.indexOf(decimal_separator) === -1 || decimalPos === stringValue.length - 1) {
	    stringValue = stringValue.substring(0, stringValue.length - 1);
	}
	// bullet 13:
	if (typeof exponent !== 'undefined') {
	    var stringExponent = makeString(exponent, 0);
	    padLeft = pic.minimumExponentSize - stringExponent.length;
	    if (padLeft > 0) {
		stringExponent = new Array(padLeft + 1).join(zero_digit) + stringExponent;
	    }
	    stringValue = stringValue + properties['exponent-separator'] + (exponent < 0 ? minus_sign : '') + stringExponent;
	}
	// bullet 14:
	stringValue = pic.prefix + stringValue + pic.suffix;
	return stringValue;
    }

    // I don't see "now" in the functions file.
    return {
	base64encode,
	base64decode,
	match,
	formatNumber,
	formatInteger,
	round,
	fromMillis,
	millis,
	toMillis
    };
})();

module.exports = nataBorrowed;
