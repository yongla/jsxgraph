/*
    Copyright 2008-2021
        Matthias Ehmann,
        Michael Gerhaeuser,
        Carsten Miller,
        Bianca Valentin,
        Alfred Wassermann,
        Peter Wilfahrt

    This file is part of JSXGraph.

    JSXGraph is free software dual licensed under the GNU LGPL or MIT License.

    You can redistribute it and/or modify it under the terms of the

      * GNU Lesser General Public License as published by
        the Free Software Foundation, either version 3 of the License, or
        (at your option) any later version
      OR
      * MIT License: https://github.com/jsxgraph/jsxgraph/blob/master/LICENSE.MIT

    JSXGraph is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License and
    the MIT License along with JSXGraph. If not, see <http://www.gnu.org/licenses/>
    and <http://opensource.org/licenses/MIT/>.
 */


/*global JXG: true, define: true*/
/*jslint nomen: true, plusplus: true*/

/* depends:
 jxg
 base/constants
 utils/type
 */

/**
 * @fileoverview In this file the class Group is defined, a class for
 * managing grouping of points.
 */

define([
    'jxg', 'base/constants', 'math/math', 'math/geometry', 'utils/type'
], function (JXG, Const, Mat, Geometry, Type) {

    "use strict";

    /**
     * Creates a new instance of Group.
     * @class In this class all group management is done.
     * @param {JXG.Board} board
     * @param {String} id Unique identifier for this object.  If null or an empty string is given,
     * an unique id will be generated by Board
     * @param {String} name Not necessarily unique name, displayed on the board.  If null or an
     * empty string is given, an unique name will be generated.
     * @param {Array} objects Array of points to add to this group.
     * @param {Object} attributes Defines the visual appearance of the group.
     * @constructor
     */
    JXG.Group = function (board, id, name, objects, attributes) {
        var number, objArray, i, obj;

        this.board = board;
        this.objects = {};
        number = this.board.numObjects;
        this.board.numObjects += 1;

        if ((id === '') || !Type.exists(id)) {
            this.id = this.board.id + 'Group' + number;
        } else {
            this.id = id;
        }
        this.board.groups[this.id] = this;

        this.type = Const.OBJECT_TYPE_POINT;
        this.elementClass = Const.OBJECT_CLASS_POINT;

        if ((name === '') || !Type.exists(name)) {
            this.name = 'group_' + this.board.generateName(this);
        } else {
            this.name = name;
        }
        delete this.type;

        /**
         * Cache coordinates of points. From this and the actual position
         * of the points, the translation is determined.
         * It has to be kept updated in this class "by hand"-
         *
         * @private
         * @type Object
         * @see JXG.Group#_updateCoordsCache
         */
        this.coords = {};
        this.needsRegularUpdate = attributes.needsregularupdate;

        this.rotationCenter = 'centroid';
        this.scaleCenter = null;
        this.rotationPoints = [];
        this.translationPoints = [];
        this.scalePoints = [];
        this.scaleDirections = {};

        this.parents = [];

        if (Type.isArray(objects)) {
            objArray = objects;
        } else {
            objArray = Array.prototype.slice.call(arguments, 3);
        }

        for (i = 0; i < objArray.length; i++) {
            obj = this.board.select(objArray[i]);

            if ((!Type.evaluate(obj.visProp.fixed)) && Type.exists(obj.coords)) {
                this.addPoint(obj);
            }
        }

        this.methodMap = {
            ungroup: 'ungroup',
            add: 'addPoint',
            addPoint: 'addPoint',
            addPoints: 'addPoints',
            addGroup: 'addGroup',
            remove: 'removePoint',
            removePoint: 'removePoint',
            setAttribute: 'setAttribute',
            setProperty: 'setAttribute'
        };
    };

    JXG.extend(JXG.Group.prototype, /** @lends JXG.Group.prototype */ {
        /**
         * Releases all elements of this group.
         * @returns {JXG.Group} returns this (empty) group
         */
        ungroup: function () {
            var el, p, i;
            for (el in this.objects) {
                if (this.objects.hasOwnProperty(el)) {
                    p = this.objects[el].point;
                    if (Type.isArray(p.groups)) {
                        i = Type.indexOf(p.groups, this.id);
                        if (i >= 0) {
                            delete p.groups[i];
                        }
                    }
                }
            }

            this.objects = {};
            return this;
        },

        /**
         * Adds ids of elements to the array this.parents. This is a copy
         * of {@link Element.addParents}.
         * @param {Array} parents Array of elements or ids of elements.
         * Alternatively, one can give a list of objects as parameters.
         * @returns {JXG.Object} reference to the object itself.
         **/
        addParents: function (parents) {
            var i, len, par;

            if (Type.isArray(parents)) {
                par = parents;
            } else {
                par = arguments;
            }

            len = par.length;
            for (i = 0; i < len; ++i) {
                if (Type.isId(this.board, par[i])) {
                    this.parents.push(par[i]);
                } else if (Type.exists(par[i].id)) {
                    this.parents.push(par[i].id);
                }
            }

            this.parents = Type.uniqueArray(this.parents);
        },

        /**
         * Sets ids of elements to the array this.parents. This is a copy
         * of {@link Element.setParents}
         * First, this.parents is cleared. See {@link Group#addParents}.
         * @param {Array} parents Array of elements or ids of elements.
         * Alternatively, one can give a list of objects as parameters.
         * @returns {JXG.Object} reference to the object itself.
         **/
        setParents: function(parents) {
            this.parents = [];
            this.addParents(parents);
            return this;
        },

        /**
         * List of the element ids resp. values used as parents in {@link JXG.Board#create}.
         * @returns {Array}
         */
        getParents: function () {
            return Type.isArray(this.parents) ? this.parents : [];
        },

        /**
         * Update the cached coordinates of a group element.
         * @param  {String} el element id of the group element whose cached coordinates
         * are going to be updated.
         * @return null
         */
        _updateCoordsCache: function(el) {
            var obj;
            if (el !== "" && Type.exists(this.objects[el])) {
                obj = this.objects[el].point;
                this.coords[obj.id] = {usrCoords: obj.coords.usrCoords.slice(0)};
            }
        },

        /**
         * Sends an update to all group members.
         * This method is called from the points' coords object event listeners
         * and not by the board.
         * @returns {JXG.Group} returns this group
         */
        update: function () {
            var drag, el, actionCenter, desc, s, sx, sy, alpha, t, center, obj = null;

            if (!this.needsUpdate) {
                return this;
            }

            drag = this._update_find_drag_type();
            if (drag.action === 'nothing') {
                this._updateCoordsCache(drag.id);
                return this;
            }

            obj = this.objects[drag.id].point;

            // Prepare translation, scaling or rotation
            if (drag.action === 'translation') {
                t = [
                    obj.coords.usrCoords[1] - this.coords[drag.id].usrCoords[1],
                    obj.coords.usrCoords[2] - this.coords[drag.id].usrCoords[2]
                ];

            } else if (drag.action === 'rotation' || drag.action === 'scaling') {
                if (drag.action === 'rotation') {
                    actionCenter = 'rotationCenter';
                } else {
                    actionCenter = 'scaleCenter';
                }

                if (Type.isPoint(this[actionCenter])) {
                    center = this[actionCenter].coords.usrCoords.slice(1);
                } else if (this[actionCenter] === 'centroid') {
                    center = this._update_centroid_center();
                } else if (Type.isArray(this[actionCenter])) {
                    center = this[actionCenter];
                } else if (Type.isFunction(this[actionCenter])) {
                    center = this[actionCenter]();
                } else {
                    return this;
                }

                if (drag.action === 'rotation') {
                    alpha = Geometry.rad(this.coords[drag.id].usrCoords.slice(1), center, this.objects[drag.id].point);
                    t = this.board.create('transform', [alpha, center[0], center[1]], {type: 'rotate'});
                    t.update();  // This initializes t.matrix, which is needed if the action element is the first group element.
                } else if (drag.action === 'scaling') {
                    s = Geometry.distance(this.coords[drag.id].usrCoords.slice(1), center);
                    if (Math.abs(s) < Mat.eps) {
                        return this;
                    }
                    s = Geometry.distance(obj.coords.usrCoords.slice(1), center) / s;
                    sx = (this.scaleDirections[drag.id].indexOf('x') >= 0) ? s : 1.0;
                    sy = (this.scaleDirections[drag.id].indexOf('y') >= 0) ? s : 1.0;

                    // Shift scale center to origin, scale and shift the scale center back.
                    t = this.board.create('transform',
                            [1, 0, 0,
                             center[0] * (1 -  sx), sx, 0,
                             center[1] * (1 -  sy), 0, sy], {type: 'generic'});
                    t.update();  // This initializes t.matrix, which is needed if the action element is the first group element.
                } else {
                    return this;
                }
            }

            this._update_apply_transformation(drag, t);

            this.needsUpdate = false;  // This is needed here to prevent infinite recursion because
                                       // of the board.updateElements call below,

            // Prepare dependent objects for update
            for (el in this.objects) {
                if (this.objects.hasOwnProperty(el)) {
                    for (desc in this.objects[el].descendants) {
                        if (this.objects[el].descendants.hasOwnProperty(desc)) {
                            this.objects[el].descendants.needsUpdate = this.objects[el].descendants.needsRegularUpdate || this.board.needsFullUpdate;
                        }
                    }
                }
            }
            this.board.updateElements(drag);

            // Now, all group elements have their new position and
            // we can update the bookkeeping of the coordinates of the group elements.
            for (el in this.objects) {
                if (this.objects.hasOwnProperty(el)) {
                    this._updateCoordsCache(el);
                }
            }

            return this;
        },

        /**
         * @private
         * Determine what the dragging of a group element should do:
         * rotation, translation, scaling or nothing.
         */
        _update_find_drag_type: function () {
            var el, obj,
                action = 'nothing',
                changed = [],
                dragObjId;

            // Determine how many elements have changed their position
            // If more than one element changed its position, it is a translation.
            // If exactly one element changed its position we have to find the type of the point.
            for (el in this.objects) {
                if (this.objects.hasOwnProperty(el)) {
                    obj = this.objects[el].point;

                    if (obj.coords.distance(Const.COORDS_BY_USER, this.coords[el]) > Mat.eps) {
                        changed.push(obj.id);
                    }
                }
            }

            // Determine type of action: translation, scaling or rotation
            if (changed.length === 0) {
                return {
                    'action': action,
                    'id': '',
                    'changed': changed
                };
            }

            dragObjId = changed[0];
            obj = this.objects[dragObjId].point;

            if (changed.length > 1) { // More than one point moved => translation
                action = 'translation';
            } else {                        // One point moved => we have to determine the type
                if (Type.isInArray(this.rotationPoints, obj) && Type.exists(this.rotationCenter)) {
                    action = 'rotation';
                } else if (Type.isInArray(this.scalePoints, obj) && Type.exists(this.scaleCenter)) {
                    action = 'scaling';
                } else if (Type.isInArray(this.translationPoints, obj)) {
                    action = 'translation';
                }
            }

            return {
                'action': action,
                'id': dragObjId,
                'changed': changed
            };
        },

        /**
         * @private
         * Determine the Euclidean coordinates of the centroid of the group.
         * @returns {Array} array of length two,
         */
        _update_centroid_center: function () {
            var center, len, el;

            center = [0, 0];
            len = 0;
            for (el in this.coords) {
                if (this.coords.hasOwnProperty(el)) {
                    center[0] += this.coords[el].usrCoords[1];
                    center[1] += this.coords[el].usrCoords[2];
                    ++len;
                }
            }
            if (len > 0) {
                center[0] /= len;
                center[1] /= len;
            }

            return center;
        },

        /**
         * @private
         * Apply the transformation to all elements of the group
         */
        _update_apply_transformation: function (drag, t) {
            var el, obj;

            for (el in this.objects) {
                if (this.objects.hasOwnProperty(el)) {
                    if (Type.exists(this.board.objects[el])) {
                        obj = this.objects[el].point;

                        // Here, it is important that we change the position
                        // of elements by using setCoordinates.
                        // Thus, we avoid the call of snapToGrid().
                        // This is done in the subsequent call of board.updateElements()
                        // in Group.update() above.
                        if (obj.id !== drag.id) {
                            if (drag.action === 'translation') {
                                if (!Type.isInArray(drag.changed, obj.id)) {
                                    obj.coords.setCoordinates(Const.COORDS_BY_USER,
                                        [this.coords[el].usrCoords[1] + t[0],
                                         this.coords[el].usrCoords[2] + t[1]]);
                                }
                            } else if (drag.action === 'rotation' || drag.action === 'scaling') {
                                t.applyOnce([obj]);
                            }
                        } else {
                            if (drag.action === 'rotation' || drag.action === 'scaling') {
                                obj.coords.setCoordinates(Const.COORDS_BY_USER,
                                    Mat.matVecMult(t.matrix, this.coords[obj.id].usrCoords));
                            }
                        }
                    } else {
                        delete this.objects[el];
                    }
                }
            }
        },

        /**
         * Adds an Point to this group.
         * @param {JXG.Point} object The point added to the group.
         * @returns {JXG.Group} returns this group
         */
        addPoint: function (object) {
            this.objects[object.id] = {point: this.board.select(object)};
            this._updateCoordsCache(object.id);
            //this.coords[object.id] = {usrCoords: object.coords.usrCoords.slice(0) };
            this.translationPoints.push(object);

            object.groups.push(this.id);
            object.groups = Type.uniqueArray(object.groups);

            return this;
        },

        /**
         * Adds multiple points to this group.
         * @param {Array} objects An array of points to add to the group.
         * @returns {JXG.Group} returns this group
         */
        addPoints: function (objects) {
            var p;

            for (p = 0; p < objects.length; p++) {
                this.addPoint(objects[p]);
            }

            return this;
        },

        /**
         * Adds all points in a group to this group.
         * @param {JXG.Group} group The group added to this group.
         * @returns {JXG.Group} returns this group
         */
        addGroup: function (group) {
            var el;

            for (el in group.objects) {
                if (group.objects.hasOwnProperty(el)) {
                    this.addPoint(group.objects[el].point);
                }
            }

            return this;
        },

        /**
         * Removes a point from the group.
         * @param {JXG.Point} point
         * @returns {JXG.Group} returns this group
         */
        removePoint: function (point) {
            delete this.objects[point.id];

            return this;
        },

        /**
         * Sets the center of rotation for the group. This is either a point or the centroid of the group.
         * @param {JXG.Point|String} object A point which will be the center of rotation, the string "centroid", or
         * an array of length two, or a function returning an array of length two.
         * @default 'centroid'
         * @returns {JXG.Group} returns this group
         */
        setRotationCenter: function (object) {
            this.rotationCenter = object;

            return this;
        },

        /**
         * Sets the rotation points of the group. Dragging at one of these points results into a rotation of the whole group around
         * the rotation center of the group {@see JXG.Group#setRotationCenter}.
         * @param {Array|JXG.Point} objects Array of {@link JXG.Point} or arbitrary number of {@link JXG.Point} elements.
         * @returns {JXG.Group} returns this group
         */
        setRotationPoints: function (objects) {
            return this._setActionPoints('rotation', objects);
        },

        /**
         * Adds a point to the set of rotation points of the group. Dragging at one of these points results into a rotation of the whole group around
         * the rotation center of the group {@see JXG.Group#setRotationCenter}.
         * @param {JXG.Point} point {@link JXG.Point} element.
         * @returns {JXG.Group} returns this group
         */
        addRotationPoint: function (point) {
            return this._addActionPoint('rotation', point);
        },

        /**
         * Removes the rotation property from a point of the group.
         * @param {JXG.Point} point {@link JXG.Point} element.
         * @returns {JXG.Group} returns this group
         */
        removeRotationPoint: function (point) {
            return this._removeActionPoint('rotation', point);
        },

        /**
         * Sets the translation points of the group. Dragging at one of these points results into a translation of the whole group.
         * @param {Array|JXG.Point} objects Array of {@link JXG.Point} or arbitrary number of {@link JXG.Point} elements.
         *
         * By default, all points of the group are translation points.
         * @returns {JXG.Group} returns this group
         */
        setTranslationPoints: function (objects) {
            return this._setActionPoints('translation', objects);
        },

        /**
         * Adds a point to the set of the translation points of the group.
         * Dragging one of these points results into a translation of the whole group.
         * @param {JXG.Point} point {@link JXG.Point} element.
         * @returns {JXG.Group} returns this group
         */
        addTranslationPoint: function (point) {
            return this._addActionPoint('translation', point);
        },

        /**
         * Removes the translation property from a point of the group.
         * @param {JXG.Point} point {@link JXG.Point} element.
         * @returns {JXG.Group} returns this group
         */
        removeTranslationPoint: function (point) {
            return this._removeActionPoint('translation', point);
        },

        /**
         * Sets the center of scaling for the group. This is either a point or the centroid of the group.
         * @param {JXG.Point|String} object A point which will be the center of scaling, the string "centroid", or
         * an array of length two, or a function returning an array of length two.
         * @returns {JXG.Group} returns this group
         */
        setScaleCenter: function (object) {
            this.scaleCenter = object;

            return this;
        },

        /**
         * Sets the scale points of the group. Dragging at one of these points results into a scaling of the whole group.
         * @param {Array|JXG.Point} objects Array of {@link JXG.Point} or arbitrary number of {@link JXG.Point} elements.
         * @param {String} direction Restricts the directions to be scaled. Possible values are 'x', 'y', 'xy'. Default value is 'xy'.
         *
         * By default, all points of the group are translation points.
         * @returns {JXG.Group} returns this group
         */
        setScalePoints: function (objects, direction) {
            var objs, i, len;
            if (Type.isArray(objects)) {
                objs = objects;
            } else {
                objs = arguments;
            }

            len = objs.length;
            for (i = 0; i < len; ++i) {
                this.scaleDirections[this.board.select(objs[i]).id] = direction || 'xy';
            }

            return this._setActionPoints('scale', objects);
        },

        /**
         * Adds a point to the set of the scale points of the group. Dragging at one of these points results into a scaling of the whole group.
         * @param {JXG.Point} point {@link JXG.Point} element.
         * @param {String} direction Restricts the directions to be scaled. Possible values are 'x', 'y', 'xy'. Default value is 'xy'.
         * @returns {JXG.Group} returns this group
         */
        addScalePoint: function (point, direction) {
            this._addActionPoint('scale', point);
            this.scaleDirections[this.board.select(point).id] = direction || 'xy';

            return this;
        },

        /**
         * Removes the scaling property from a point of the group.
         * @param {JXG.Point} point {@link JXG.Point} element.
         * @returns {JXG.Group} returns this group
         */
        removeScalePoint: function (point) {
            return this._removeActionPoint('scale', point);
        },

        /**
         * Generic method for {@link JXG.Group@setTranslationPoints} and {@link JXG.Group@setRotationPoints}
         * @private
         */
        _setActionPoints: function (action, objects) {
            var objs, i, len;
            if (Type.isArray(objects)) {
                objs = objects;
            } else {
                objs = arguments;
            }

            len = objs.length;
            this[action + 'Points'] = [];
            for (i = 0; i < len; ++i) {
                this._addActionPoint(action, objs[i]);
            }

            return this;
        },

        /**
         * Generic method for {@link JXG.Group@addTranslationPoint} and {@link JXG.Group@addRotationPoint}
         * @private
         */
        _addActionPoint: function (action, point) {
            this[action + 'Points'].push(this.board.select(point));

            return this;
        },

        /**
         * Generic method for {@link JXG.Group@removeTranslationPoint} and {@link JXG.Group@removeRotationPoint}
         * @private
         */
        _removeActionPoint: function (action, point) {
            var idx = this[action + 'Points'].indexOf(this.board.select(point));
            if (idx > -1) {
                this[action + 'Points'].splice(idx, 1);
            }

            return this;
        },

        /**
         * @deprecated
         * Use setAttribute
         */
        setProperty: function () {
            JXG.deprecated('Group.setProperty', 'Group.setAttribute()');
            this.setAttribute.apply(this, arguments);
        },

        setAttribute: function () {
            var el;

            for (el in this.objects) {
                if (this.objects.hasOwnProperty(el)) {
                    this.objects[el].point.setAttribute.apply(this.objects[el].point, arguments);
                }
            }

            return this;
        }
    });

    /**
     * @class This element combines a given set of {@link JXG.Point} elements to a
     *  group. The elements of the group and dependent elements can be translated, rotated and scaled by
     *  dragging one of the group elements.
     *
     *
     * @pseudo
     * @description
     * @name Group
     * @augments JXG.Group
     * @constructor
     * @type JXG.Group
     * @param {JXG.Board} board The board the points are on.
     * @param {Array} parents Array of points to group.
     * @param {Object} attributes Visual properties (unused).
     * @returns {JXG.Group}
     *
     * @example
     *
     *  // Create some free points. e.g. A, B, C, D
     *  // Create a group
     *
     *  var p, col, g;
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  g = board.create('group', p);
     *
     * </pre><div class="jxgbox" id="JXGa2204533-db91-4af9-b720-70394de4d367" style="width: 400px; height: 300px;"></div>
     * <script type="text/javascript">
     *  (function () {
     *  var board, p, col, g;
     *  board = JXG.JSXGraph.initBoard('JXGa2204533-db91-4af9-b720-70394de4d367', {boundingbox:[-5,5,5,-5], keepaspectratio:true, axis:true, showcopyright: false});
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  g = board.create('group', p);
     *  })();
     * </script><pre>
     *
     *
     * @example
     *
     *  // Create some free points. e.g. A, B, C, D
     *  // Create a group
     *  // If the points define a polygon and the polygon has the attribute hasInnerPoints:true,
     *  // the polygon can be dragged around.
     *
     *  var p, col, pol, g;
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p);
     *
     * </pre><div class="jxgbox" id="JXG781b5564-a671-4327-81c6-de915c8f924e" style="width: 400px; height: 300px;"></div>
     * <script type="text/javascript">
     *  (function () {
     *  var board, p, col, pol, g;
     *  board = JXG.JSXGraph.initBoard('JXG781b5564-a671-4327-81c6-de915c8f924e', {boundingbox:[-5,5,5,-5], keepaspectratio:true, axis:true, showcopyright: false});
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p);
     *  })();
     * </script><pre>
     *
     *  @example
     *
     *  // Allow rotations:
     *  // Define a center of rotation and declare points of the group as "rotation points".
     *
     *  var p, col, pol, g;
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p);
     *  g.setRotationCenter(p[0]);
     *  g.setRotationPoints([p[1], p[2]]);
     *
     * </pre><div class="jxgbox" id="JXGf0491b62-b377-42cb-b55c-4ef5374b39fc" style="width: 400px; height: 300px;"></div>
     * <script type="text/javascript">
     *  (function () {
     *  var board, p, col, pol, g;
     *  board = JXG.JSXGraph.initBoard('JXGf0491b62-b377-42cb-b55c-4ef5374b39fc', {boundingbox:[-5,5,5,-5], keepaspectratio:true, axis:true, showcopyright: false});
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p);
     *  g.setRotationCenter(p[0]);
     *  g.setRotationPoints([p[1], p[2]]);
     *  })();
     * </script><pre>
     *
     *  @example
     *
     *  // Allow rotations:
     *  // As rotation center, arbitrary points, coordinate arrays,
     *  // or functions returning coordinate arrays can be given.
     *  // Another possibility is to use the predefined string 'centroid'.
     *
     *  // The methods to define the rotation points can be chained.
     *
     *  var p, col, pol, g;
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p).setRotationCenter('centroid').setRotationPoints([p[1], p[2]]);
     *
     * </pre><div class="jxgbox" id="JXG8785b099-a75e-4769-bfd8-47dd4376fe27" style="width: 400px; height: 300px;"></div>
     * <script type="text/javascript">
     *  (function () {
     *  var board, p, col, pol, g;
     *  board = JXG.JSXGraph.initBoard('JXG8785b099-a75e-4769-bfd8-47dd4376fe27', {boundingbox:[-5,5,5,-5], keepaspectratio:true, axis:true, showcopyright: false});
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p).setRotationCenter('centroid').setRotationPoints([p[1], p[2]]);
     *  })();
     * </script><pre>
     *
     *  @example
     *
     *  // Allow scaling:
     *  // As for rotation one can declare points of the group to trigger a scaling operation.
     *  // For this, one has to define a scaleCenter, in analogy to rotations.
     *
     *  // Here, the yellow  point enables scaling, the red point a rotation.
     *
     *  var p, col, pol, g;
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'yellow', fillColor:'yellow'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p).setRotationCenter('centroid').setRotationPoints([p[2]]);
     *  g.setScaleCenter(p[0]).setScalePoints(p[1]);
     *
     * </pre><div class="jxgbox" id="JXGc3ca436b-e4fc-4de5-bab4-09790140c675" style="width: 400px; height: 300px;"></div>
     * <script type="text/javascript">
     *  (function () {
     *  var board, p, col, pol, g;
     *  board = JXG.JSXGraph.initBoard('JXGc3ca436b-e4fc-4de5-bab4-09790140c675', {boundingbox:[-5,5,5,-5], keepaspectratio:true, axis:true, showcopyright: false});
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'yellow', fillColor:'yellow'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p).setRotationCenter('centroid').setRotationPoints([p[2]]);
     *  g.setScaleCenter(p[0]).setScalePoints(p[1]);
     *  })();
     * </script><pre>
     *
     *  @example
     *
     *  // Allow Translations:
     *  // By default, every point of a group triggers a translation.
     *  // There may be situations, when this is not wanted.
     *
     *  // In this example, E triggers nothing, but itself is rotation center
     *  // and is translated, if other points are moved around.
     *
     *  var p, q, col, pol, g;
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'yellow', fillColor:'yellow'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  q = board.create('point',[0, 0], {size: 5, strokeColor:col, fillColor:col});
     *
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p.concat(q)).setRotationCenter('centroid').setRotationPoints([p[2]]);
     *  g.setScaleCenter(p[0]).setScalePoints(p[1]);
     *  g.removeTranslationPoint(q);
     *
     * </pre><div class="jxgbox" id="JXGd19b800a-57a9-4303-b49a-8f5b7a5488f0" style="width: 400px; height: 300px;"></div>
     * <script type="text/javascript">
     *  (function () {
     *  var board, p, q, col, pol, g;
     *  board = JXG.JSXGraph.initBoard('JXGd19b800a-57a9-4303-b49a-8f5b7a5488f0', {boundingbox:[-5,5,5,-5], keepaspectratio:true, axis:true, showcopyright: false});
     *  col = 'blue';
     *  p = [];
     *  p.push(board.create('point',[-2, -1 ], {size: 5, strokeColor:col, fillColor:col}));
     *  p.push(board.create('point',[2, -1 ], {size: 5, strokeColor:'yellow', fillColor:'yellow'}));
     *  p.push(board.create('point',[2, 1 ], {size: 5, strokeColor:'red', fillColor:'red'}));
     *  p.push(board.create('point',[-2, 1], {size: 5, strokeColor:col, fillColor:col}));
     *  q = board.create('point',[0, 0], {size: 5, strokeColor:col, fillColor:col});
     *
     *  pol = board.create('polygon', p, {hasInnerPoints: true});
     *  g = board.create('group', p.concat(q)).setRotationCenter('centroid').setRotationPoints([p[2]]);
     *  g.setScaleCenter(p[0]).setScalePoints(p[1]);
     *  g.removeTranslationPoint(q);
     *  })();
     * </script><pre>
     *
     *
     */
    JXG.createGroup = function (board, parents, attributes) {
        var attr = Type.copyAttributes(attributes, board.options, 'group'),
            g = new JXG.Group(board, attr.id, attr.name, parents, attr);

        g.elType = 'group';
        g.setParents(parents);

        return g;
    };

    JXG.registerElement('group', JXG.createGroup);

    return {
        Group: JXG.Group,
        createGroup: JXG.createGroup
    };
});
