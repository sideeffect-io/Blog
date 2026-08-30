---
title: RxFlow, partie 1 — La théorie
date: 2017-11-08
description: Voici le premier article d’une série qui occupera une place centrale sur ce blog pendant quelque temps. Je vais présenter RxFlow, un framework de ma conception qui implémente le pattern Reactive Flow Coordinator dans les applications iOS. RxFlow s’appuie sur RxSwift et bénéficie du soutien de la RxSwiftCommunity.
tags: open source, programmation réactive
image: images/2017-11-08-RxFlow-Part1/RxFlow_Logo.png
lang: fr
---

Voici le premier article d’une série qui occupera une place centrale sur ce blog pendant quelque temps. Je vais présenter **RxFlow**, un framework de ma conception qui implémente le pattern Reactive Flow Coordinator dans les applications iOS. **RxFlow** est un projet soutenu par la [RxSwiftCommunity](https://github.com/RxSwiftCommunity).

# Le constat

Deux choix s’offrent à nous pour gérer la navigation dans une application iOS :

* utiliser le mécanisme intégré fourni par Apple et Xcode : storyboards et segues ;
* implémenter un mécanisme personnalisé directement dans le code.

Ces deux solutions ont leurs inconvénients :

* mécanisme intégré : la navigation est relativement statique et les storyboards deviennent énormes. Le code de navigation pollue les UIViewControllers ;
* mécanisme personnalisé : le code peut être difficile à mettre en place et devenir complexe selon le design pattern choisi — Router ou Coordinator.

# L’objectif

**RxFlow** vise à :

* favoriser le découpage des storyboards en unités atomiques afin de faciliter la collaboration et la réutilisation des UIViewControllers ;
* permettre de présenter un UIViewController de différentes manières selon le contexte de navigation ;
* faciliter la mise en œuvre de l’injection de dépendances ;
* retirer tout mécanisme de navigation des UIViewControllers ;
* promouvoir la programmation réactive ;
* exprimer la navigation de manière déclarative tout en couvrant la majorité des cas de navigation ;
* faciliter le découpage d’une application en blocs logiques de navigation.

# Du Storyboard au pattern Coordinator

À mesure que mon expérience de développeur iOS grandissait — ainsi que celle de développeur Android ou web —, je me retrouvais constamment face aux mêmes doutes concernant la navigation. Pour les autres problématiques de conception, il existait de nombreux patterns répondant aux questions courantes d’architecture et de séparation des responsabilités — MVC, MVP, MVVM, VIPER…

Mais dès qu’il fallait concevoir la navigation, j’étais partagé :

* comment utiliser l’injection de dépendances avec les Storyboards et les Segues ?
* comment contrôler le flux de l’application ?
* comment débarrasser les UIViewControllers du code répétitif de navigation ?

Au fil du temps, ma conception d’une application iOS est passée du MVC avec un seul Storyboard au MVC avec plusieurs Storyboards, pour finalement atteindre ce que l’on pourrait appeler aujourd’hui une bonne pratique : MVVM avec **Flow Coordinator**. Cette solution fonctionne parfaitement, car elle permet de jouer avec l’injection de dépendances, la réutilisation des UIViewControllers et la testabilité. J’ai eu la chance d’appliquer ce pattern à d’énormes applications complexes en production. Mais quelques problèmes continuaient à me gêner :

* je devais toujours réécrire le pattern Coordinator, encore et encore ;
* de nombreux mécanismes de délégation étaient nécessaires pour permettre aux ViewModels de communiquer avec les Coordinators ;
* j’ai commencé à m’intéresser au pattern Redux, en particulier à son mécanisme d’état de navigation. Nous pouvions disposer d’un état global de navigation, exposé par des Observables RxSwift, et d’un élément qui écoute cet état pour piloter la navigation. La seule chose qui me dérangeait était l’unicité de cet état de navigation et les responsabilités incontrôlées qu’il pouvait accumuler, tout comme la masse de données qu’il pouvait stocker.

L’idée que la navigation n’était que le reflet d’un état susceptible d’évoluer étape par étape a commencé à émerger. Un état réparti dans toute la structure de l’application, non pas stocké en un lieu unique, mais unifié par un observateur capable d’y réagir et de piloter la navigation en conséquence. Plus loin dans cet article, ces petits états répartis dans l’application sont appelés les **Steps**, et l’observateur, le **Coordinator**.

**RxFlow** est né de toute cette expérience et répond aux deux principales préoccupations qui subsistaient avec le pattern Coordinator traditionnel :

* le développeur n’a plus à écrire de Coordinators ; il lui suffit de déclarer la navigation et les états auxquels elle réagit ;
* la délégation n’est plus nécessaire, puisque les états sont des Observables RxSwift observés par le FlowCoordinator.

# Les principes clés

Pour en savoir plus sur le pattern Coordinator, je vous conseille cet article : [Coordinator Redux](http://khanlou.com/2015/10/coordinators-redux/).

Bien qu’il s’agisse d’une très bonne architecture, le pattern **Coordinator** présente quelques inconvénients :

* il faut écrire le mécanisme de coordination à chaque démarrage d’une nouvelle application ;
* le pattern de délégation utilisé pour communiquer avec les Coordinators peut générer beaucoup de code répétitif.

RxFlow est une implémentation réactive du pattern Coordinator. Il conserve toutes les qualités de cette architecture tout en apportant quelques améliorations :

* il rend la navigation plus déclarative ;
* il fournit un Coordinator intégré qui gère les flux de navigation déclarés ;
* il utilise la programmation réactive pour résoudre le problème de la communication avec les Coordinators.

Vous devez connaître six termes pour comprendre RxFlow :

* **Flow** : chaque Flow définit une zone de navigation dans votre application. C’est l’endroit où vous déclarez les actions de navigation, comme la présentation d’un UIViewController ou d’un autre Flow ;
* **Step** : chaque Step représente un état de navigation dans votre application. Les combinaisons de Flows et de Steps décrivent toutes les actions de navigation possibles. Un Step peut même embarquer des valeurs — identifiants, URL… — qui seront propagées aux écrans déclarés dans les Flows ;
* **Stepper** : il peut s’agir de n’importe quel élément capable d’émettre des Steps. Les Steppers sont responsables du déclenchement des actions de navigation dans les Flows ;
* **Presentable** : abstraction d’un élément pouvant être présenté — principalement UIViewController et Flow. Les Presentables offrent des observables réactifs auxquels le Coordinator s’abonne afin de gérer les Steps des Flows d’une manière compatible avec UIKit ;
* **Flowable** : structure de données simple qui associe un Presentable et un Stepper. Elle indique au Coordinator quel sera le prochain élément à produire de nouveaux Steps dans le mécanisme réactif ;
* **Coordinator** : une fois que le développeur a défini les bonnes combinaisons de Flows et de Steps représentant les possibilités de navigation, le Coordinator les assemble de manière cohérente.

Ce premier article ne traite que des aspects conceptuels et théoriques du framework. Les suivants aborderont **RxFlow** d’un point de vue plus technique, avec des exemples de code.

Vous pouvez déjà parcourir le dépôt GitHub de **RxFlow**, qui contient une application de démonstration : [https://github.com/RxSwiftCommunity/RxFlow](https://github.com/RxSwiftCommunity/RxFlow).

À bientôt.
