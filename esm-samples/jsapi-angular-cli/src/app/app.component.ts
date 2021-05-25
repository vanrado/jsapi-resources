import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  OnDestroy
} from '@angular/core';

import WebMap from '@arcgis/core/WebMap';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import Bookmarks from '@arcgis/core/widgets/Bookmarks';
import Expand from '@arcgis/core/widgets/Expand';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import FeatureSet from '@arcgis/core/tasks/support/FeatureSet';
import QueryProperties = __esri.QueryProperties;
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';
import FeatureLayerView from '@arcgis/core/views/layers/FeatureLayerView';
import { FormControl } from '@angular/forms';
import FeatureFilter from '@arcgis/core/views/layers/support/FeatureFilter';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  public view: MapView = null;
  public map: Map = null;

  zipCode = new FormControl('none');
  zipCodeServer = new FormControl('none');

  private serverSideLayer: FeatureLayer;
  private graphicLayer: GraphicsLayer;
  private bufferLayer: GraphicsLayer;
  private pointGraphic: Graphic;
  private bufferGraphic: Graphic;

  // The <div> where we will place the map
  @ViewChild('mapViewNode', {static: true}) private mapViewEl: ElementRef;

  initializeMap(): Promise<any> {
    const container = this.mapViewEl.nativeElement;
    // Reference the feature layer to query
    // https://services3.arcgis.com/GVgbJbqm8hXASVYi/ArcGIS/rest/services/Trails_Styled/FeatureServer/0
    // https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trailheads_Styled/FeatureServer/0
    this.serverSideLayer = new FeatureLayer({
      url:
        'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trailheads_Styled/FeatureServer/0',
      outFields: ['FID', 'TRL_NAME'], // 'FID', 'Area_in_Square_Miles'
      definitionExpression: '',
    });
    this.graphicLayer = new GraphicsLayer();
    this.bufferLayer = new GraphicsLayer();
    this.map = new Map({
      basemap: 'gray-vector',
      layers: [this.serverSideLayer, this.graphicLayer, this.bufferLayer]
    });

    const view = new MapView({
      container,
      map: this.map,
    });

    const bookmarks = new Bookmarks({
      view,
      // allows bookmarks to be added, edited, or deleted
      editingEnabled: true,
    });

    const bkExpand = new Expand({
      view,
      content: bookmarks,
      expanded: true,
    });

    // create graphic for mouse point click
    this.pointGraphic = new Graphic({
      symbol: new SimpleMarkerSymbol({
        color: [0, 0, 139],
        outline: {
          color: [255, 255, 255],
          width: 1.5
        }
      })
    });

    // Create graphic for distance buffer
    this.bufferGraphic = new Graphic({
      symbol: new SimpleFillSymbol({
        color: [173, 216, 230, 0.2],
        outline: {
          // autocasts as new SimpleLineSymbol()
          color: [255, 255, 255],
          width: 1,
        }
      })
    });

    // Add the widget to the top-right corner of the view
    // view.ui.add(bkExpand, 'top-right');
    this.view = view;
    return this.view.when();
  }

  ngOnInit(): any {
    // Initialize MapView and return an instance of MapView
    this.initializeMap().then(() => {
      // The map has been initialized
      this.pointerMoveListener();
      this.clickListener();
      console.log('The map is ready.');
    });

    this.zipCode.valueChanges.subscribe(value => {
      this.clientSideFilter(value);
    });

    this.zipCodeServer.valueChanges.subscribe(value => {
      this.serverSideFilter(value);
    });
  }

  ngOnDestroy(): void {
    if (this.view) {
      // destroy the map view
      this.view.destroy();
    }
  }

  addGraphics(result): void {
    this.graphicLayer.removeAll();
    result.features.forEach((feature) => {
      const g = new Graphic({
        geometry: feature.geometry,
        attributes: feature.attributes,
        symbol: new SimpleMarkerSymbol({
          color: [0, 0, 0],
          outline: {
            width: 2,
            color: [0, 255, 255]
          },
          size: '20px'
        }),
        popupTemplate: {
          title: '{TRL_NAME}',
          content: 'This a {PARK_NAME} trail located in {CITY_JUR}.'
        }
      });
      this.graphicLayer.add(g);
    });
  }

  /**
   * Server side call
   * @param point
   * @param distance
   * @param spatialRelationship
   * @param sqlExpression
   */
  queryFeatureServerData(point, distance, spatialRelationship, sqlExpression?: string): void {
    const query = {
      geometry: point,
      distance,
      spatialRelationship,
      outFields: ['*'],
      returnGeometry: true,
      where: sqlExpression
    };
    this.serverSideLayer.queryFeatures(query).then((results: FeatureSet) => {
      const feature = results.features.find(graphic => graphic.layer.id === this.serverSideLayer.id);
      if (feature) {
        if (
          !this.view.popup.features.length ||
          (this.view.popup.features.length &&
            this.view.popup.features[0].attributes.FID !== feature.attributes.FID)
        ) {
          let content = '';
          Object.keys(feature.attributes).forEach(key => {
            content += `${key}: ${feature.attributes[key]} <br>`;
          });

          this.view.popup.open({
            title: feature.attributes.TRL_NAME,
            content,
            location: feature.geometry
          });
        }
      }
    });
  }

  queryFeatureClientData(event: MouseEvent): void {
    this.view.whenLayerView(this.serverSideLayer).then((featureLayerView) => {
      this.view.hitTest(event).then((response) => {
        // Only return features for the feature layer
        const feature: Graphic = response.results.filter((result) => {
          return result.graphic.layer.id === this.serverSideLayer.id;
        })[0]?.graphic;

        if (feature) {
          const radius = 2;
          const query: QueryProperties = {
            geometry: feature.geometry,
            distance: radius,
            units: 'kilometers',
            spatialRelationship: 'intersects',
            outFields: ['*'],
            returnGeometry: false,
            returnQueryGeometry: true,
          };

          featureLayerView.queryFeatures(query).then(result => {
            // Show popup for new features only
            if (
              !this.view.popup.features.length ||
              (this.view.popup.features.length &&
                this.view.popup.features[0].attributes.FID !== feature.attributes.FID)
            ) {
              this.bufferGraphic.geometry = result.queryGeometry;
              this.bufferLayer.removeAll();
              this.bufferLayer.add(this.bufferGraphic);
              const trails = result.features.map(val => val.attributes.TRL_NAME).join(', ');

              this.view.popup.open({
                title: feature.attributes.TRL_NAME,
                content:
                  `This a trail with ${feature.attributes.TRL_NAME}:${feature.attributes.FID}.` +
                  `<br> You have ${result.features.length} alternatives in radius of ${radius} km.<br>${trails}`,
                location: feature.geometry
              });
            }
          });
        }
      });
    });
  }

  clientSideFilter(zipcode: string): void {
    this.view.whenLayerView(this.serverSideLayer).then((featureLayerView) => {
      if (zipcode !== 'none') {
        const where: FeatureFilter = new FeatureFilter({ where: `ZIP_CODE = '${zipcode}'` });
        featureLayerView.filter = where;
      } else {
        featureLayerView.filter = null;
      }
    });
  }

  serverSideFilter(zipCode: string): void {
    if (zipCode !== 'none') {
      this.serverSideLayer.definitionExpression = `ZIP_CODE = '${zipCode}'`;
    } else {
      this.serverSideLayer.definitionExpression = null;
    }
  }

  queryFeatureLayerView(point, distance, spatialRelationship, sqlExpression?: string): void {
    // Add the layer if it is missing
    if (!this.map.findLayerById(this.serverSideLayer.id)) {
      this.serverSideLayer.outFields = ['*'];
      this.map.add(this.serverSideLayer, 0);
    }
    // Set up the query
    const query = {
      geometry: point,
      distance,
      spatialRelationship,
      outFields: ['*'],
      returnGeometry: true,
      where: sqlExpression
    };
    // Wait for the layerview to be ready and then query features
    this.view.whenLayerView(this.serverSideLayer).then((featureLayerView) => {
      if (featureLayerView.updating) {
        const handle = featureLayerView.watch('updating', (isUpdating) => {
          if (!isUpdating) {
            // Execute the query
            featureLayerView.queryFeatures(query).then((result) => {
              this.addGraphics(result);
            });
            handle.remove();
          }
        });
      } else {
        // Execute the query
        featureLayerView.queryFeatures(query).then((result) => {
          this.addGraphics(result);
        });
      }
    });
  }

  private queryFeatures(screenPoint): void {
    const point = this.view.toMap(screenPoint);
    this.pointGraphic.geometry = point;
    this.view.graphics.add(this.pointGraphic);
    this.serverSideLayer.queryFeatures({
      geometry: point,
      spatialRelationship: 'intersects',
      returnGeometry: false,
      outFields: ['*'],
    })
      .then((featureSet) => {
        // set graphic location to mouse pointer and add to mapview
        this.pointGraphic.geometry = point;
        this.view.graphics.add(this.pointGraphic);
        // open popup of query result
        this.view.popup.open({
          location: point,
          features: featureSet.features
        });
      });
  }

  queryFeatureLayer(point, distance, spatialRelationship, sqlExpression?: string): void {
    const query = {
      geometry: point,
      distance,
      spatialRelationship,
      outFields: ['*'],
      returnGeometry: true,
      where: sqlExpression
    };
    this.serverSideLayer.queryFeatures(query).then((result) => {
      this.addGraphics(result);
    });
  }

  private pointerMoveListener(): void {
    this.view.on('pointer-move', (event: MouseEvent) => {
      this.queryFeatureClientData(event);
    });
  }

  private clickListener(): void {
    this.view.whenLayerView(this.serverSideLayer).then((featureLayerView) => {
      this.view.on('click', (event) => {
        this.queryFeatureServerData(event.mapPoint, 1500, 'intersects');
      });
    });
  }
}
