---
title: Quelques astuces orientées protocoles pour MVVM en Swift
date: 2018-01-02
description: MVVM est récemment devenu une sorte de standard pour l’architecture des applications iOS. Il offre une bonne séparation des responsabilités, un moyen efficace de formater les données et d’excellents mécanismes de binding avec des frameworks comme RxSwift. Voici quelques astuces qui facilitent son implémentation.
tags: astuces, architecture
image: images/2018-01-02-ProtocolOrientedTipsMvvm/POP-MVVM.png
lang: fr
---

Bonjour à tous. MVVM est récemment devenu une sorte de standard pour l’architecture des applications iOS. Il offre une bonne séparation des responsabilités, un moyen efficace de formater les données et d’excellents mécanismes de binding avec des frameworks comme RxSwift. Voici quelques astuces que j’utilise pour faciliter son implémentation.

# Des vues simplifiées avec Reusable

Avec MVVM, la séparation entre les vues et le reste de l’architecture est très claire. Les vues comprennent les UIViewControllers et leurs outlets. Leur instanciation devient donc de plus en plus importante, particulièrement depuis que des patterns comme Coordinator gagnent en popularité. Dans la suite de cet article, nous supposerons que vous implémentez ce type d’architecture.

Reusable est une API qui fournit des extensions pratiques pour les UIViews et les UIViewControllers, afin de faciliter leur instanciation de manière type-safe.

Voici le dépôt GitHub : [Reusable](https://github.com/AliSoftware/Reusable). Il s’agit d’une API légère, compatible avec Carthage, CocoaPods et SPM. Au regard du confort qu’elle apporte, il serait dommage de ne pas l’utiliser 🖖.

Reusable fournit essentiellement des mixins — des protocoles avec une implémentation par défaut — qui ajoutent des fonctions d’instanciation aux UIViews et UIViewControllers dès que vous les faites conformer au protocole approprié.

Avec le pattern Coordinator, vous devrez à un moment donné instancier des UIViewControllers et leur transmettre des ViewModels. Bonne nouvelle : Reusable facilite grandement cette tâche.

Voici ce qu’il faut faire pour utiliser Reusable afin d’instancier des UIViewControllers :

* créer un fichier Storyboard par UIViewController — il est bien sûr possible d’en placer plusieurs dans un même storyboard, mais nous n’en considérerons qu’un par souci de simplicité ;
* définir le UIViewController comme ViewController initial de la scène ;
* créer un fichier UIViewController dont le nom de classe est identique au nom du fichier Storyboard. Par exemple, si ce dernier s’appelle « SettingsViewController.storyboard », la classe sera nommée « SettingsViewController » ;
* rendre le UIViewController conforme au protocole **StoryboardBased**.

Et voilà. Vous pouvez maintenant instancier le ViewController avec une seule ligne de code :

```swift
let settingsViewController = SettingsViewController.instantiate()
```

Ce qui est intéressant, c’est que settingsViewController est de type SettingsViewController sans nécessiter de cast.

Le protocole StoryboardBased est en réalité très simple. Examinons-le :

```swift
public protocol StoryboardBased: class {
  static var storyboard: UIStoryboard { get }
}

public extension StoryboardBased {
  static var storyboard: UIStoryboard {
    return UIStoryboard(name: String(describing: self), bundle: Bundle(for: self))
  }
}

public extension StoryboardBased where Self: UIViewController {
  static func instantiate() -> Self {
    guard let vc = storyboard.instantiateInitialViewController() as? Self else {
      fatalError("The VC of \(sceneStoryboard) is not of class \(self)")
    }
    return vc
  }
}
```

Il fournit une fonction statique **instantiate** à chaque UIViewController conforme au protocole. Cette fonction renvoie une instance du UIViewController. Comme **Self** est le type de retour, l’inférence de type garantit que nous n’aurons pas à caster le résultat.

Je vous encourage vivement à examiner Reusable en détail. Il vous aidera également à instancier des UIViews depuis des Xib ou à réutiliser des UITableViewCells de manière type-safe.

# Des ViewModels orientés protocoles

Les architectures de type Coordinator sont courantes dans les applications actuelles, particulièrement lorsqu’elles sont combinées à MVVM. C’est la raison pour laquelle je souhaitais commencer par parler de Reusable.

Mais il existe une astuce que je trouve très utile et complémentaire. Elle s’accorde parfaitement avec MVVM dans une approche orientée protocoles.

L’idée n’est pas seulement de faciliter l’instanciation des UIViewControllers, mais également de proposer un moyen élégant de leur transmettre les ViewModels associés. Écrivons un protocole qui définit ce que signifie posséder un ViewModel.

```swift
protocol ViewModelBased: class {
    associatedtype ViewModel
    var viewModel: ViewModel { get set }
}
```

Nous pouvons maintenant le combiner avec StoryboardBased et fournir une fonction statique qui instancie un UIViewController en recevant un ViewModel.

```swift
extension ViewModelBased where Self: StoryboardBased & UIViewController {
    static func instantiate (with viewModel: ViewModel) -> Self {
        let viewController = Self.instantiate()
        viewController.viewModel = viewModel
        return viewController
    }
}
```

Les extensions conditionnelles sont un outil très puissant. La clause **where**, qui combine **StoryboardBased** et **UIViewController**, rend disponible la fonction Self.instantiate. Il suffit donc d’encapsuler cet appel dans une autre fonction statique qui définit la propriété UIViewController.viewModel.

Imaginons un MyViewController conforme au protocole ViewModelBased :

```swift
class MyViewController: UIViewController, StoryboardBased, ViewModelBased {
    var viewModel: MyViewModel!

    override func viewDidLoad() {
        super.viewDidLoad()
    }
}
```

Son instanciation avec le ViewModel devient extrêmement simple :

```swift
let myViewController = MyViewController.instantiate(with: MyViewModel())
```

# Allons plus loin dans l’abstraction des ViewModels

Jusqu’ici, nous devons toujours instancier le ViewModel et le transmettre à la vue. Ne serait-il pas pratique d’instancier seulement la vue et de la laisser gérer génériquement l’instanciation du ViewModel ? L’inférence de type de Swift peut beaucoup nous aider.

Avant de nous plonger dans le code, certains diront que cette technique introduit un couplage fort entre la vue et le ViewModel. C’est vrai dans une certaine mesure, mais selon le temps, l’énergie et la complexité alloués à votre application, elle peut malgré tout représenter une stratégie efficace.

Nous allons tout d’abord définir CE QU’EST un ViewModel, à l’aide d’un protocole bien sûr. Nous introduirons ainsi la notion de Services, des couches de bas niveau dont le ViewModel a besoin pour récupérer des données ou exécuter des actions.

```swift
protocol ViewModel {
    associatedtype Services
    init (withServices services: Services)
}
```

Nous devons modifier la définition de ViewModelBased afin d’introduire le protocole ViewModel dans le type associé.

```swift
protocol ViewModelBased: class {
    associatedtype ViewModelType: ViewModel
    var viewModel: ViewModelType { get set }
}
```

Nous pouvons enfin adapter l’extension ViewModelBased :

```swift
extension ViewModelBased where Self: StoryboardBased & UIViewController {
    static func instantiate<ServicesT> (withServices services: ServicesT) -> Self
    where ServicesT == Self.ViewModelType.Services {
        let viewController = Self.instantiate()
        viewController.viewModel = ViewModelType(withServices: services)
        return viewController
    }
}
```

Cette version diffère de la précédente sur deux points principaux :

* cette fonction statique instancie non seulement le UIViewController, mais aussi le ViewModel. C’est une tâche de moins pour le développeur 👍 ;
* la signature de la fonction reçoit désormais une forme de Services. Comme vous pouvez le voir, il s’agit d’une fonction générique. La clause **where** oblige le développeur à transmettre un ServicesT identique à celui requis par ViewModelType. Cela apporte sûreté et cohérence 👍.

Ce qui est remarquable ici, c’est que Swift déduit ViewModelType à partir de l’implémentation de ViewModelBased.

Voyons cela en action.

Pour les besoins de la démonstration, commençons par définir un service très simple :

```swift
class MyService {
    func executeService() {
        print ("Service execution")
    }
}
```

Nous pouvons maintenant définir un ViewModel qui dépend de ce Service :

```swift
struct MyViewModel: ViewModel {
    typealias Services = MyService

    init(withServices services: Services) {
        services.executeService()
    }
}
```

L’instanciation de MyViewController avec son ViewModel devient aussi simple que cela — en supposant que nous disposions déjà d’une instance de MyService :

```swift
let myViewController = MyViewController.instantiate(withServices: myService)
// we can access the inner ViewModel if needed: myViewController.viewModel
```

# Composition de protocoles pour les Services

Bien que cette solution paraisse très pratique, elle présente un inconvénient : que se passe-t-il si un ViewModel a besoin de plusieurs Services ?

Une solution consisterait à transmettre une sorte de conteneur fournissant TOUS les services de l’application. Cela fonctionnerait, mais manquerait de sûreté, car le ViewModel pourrait utiliser sans restriction n’importe quel service du conteneur.

J’ai lu un jour un [article de Krzysztof Zablocki](http://merowing.info/2017/04/using-protocol-compositon-for-dependency-injection/) consacré à ce problème et j’ai pensé que cette approche s’accorderait très bien avec mes ViewModels.

Imaginons que notre application ait besoin de trois services :

```swift
class Service1 {
    func executeService1() {
        print ("execution of Service1")
    }
}

class Service2 {
    func executeService2() {
        print ("execution of Service2")
    }
}

class Service3 {
    func executeService3() {
        print ("execution of Service3")
    }
}
```

L’idée consiste à utiliser la composition de protocoles pour exprimer les services requis par notre ViewModel. Nous allons définir un protocole par Service afin d’y donner accès :

```swift
protocol HasService1 {
    var service1: Service1 { get }
}

protocol HasService2 {
    var service2: Service2 { get }
}

protocol HasService3 {
    var service3: Service3 { get }
}
```

Dans nos ViewModels, nous pouvons maintenant définir clairement et finement nos dépendances :

```swift
struct MyViewModel: ViewModel {

    // thanks to protocol composition we define only the services we want to use
    typealias Services = HasService1 & HasService2

    init(withServices services: Services) {
        services.service1.executeService1()
        services.service2.executeService2()
    }
}

struct MyOtherViewModel: ViewModel {
    typealias Services = HasService2 & HasService3

    init(withServices services: Services) {
        services.service2.executeService2()
        services.service3.executeService3()
    }
}
```

La dernière étape consiste à définir le conteneur de dépendances :

```swift
class MyServices: HasService1, HasService2, HasService3 {
    let service1 = Service1()
    let service2 = Service2()
    let service3 = Service3()
}
```

Nous sommes prêts : nous pouvons désormais transmettre le conteneur à nos ViewModels avec un bon niveau de sûreté et une grande capacité d’évolution. Si un ViewModel doit accéder à un autre Service, il suffit de mettre à jour la composition de protocoles.

Au bout du compte, l’instanciation du UIViewController reste identique — considérons que MyViewController2 est lui aussi un ViewController ViewModelBased :

```swift
let myViewController = MyViewController.instantiate(withServices: myServices)
let myViewController2 = MyViewController2.instantiate(withServices: myServices)
// This is the same myServices instance for the 2 ViewControllers
// but each ViewModel will only access what's needed
```

Et voilà 👌.

J’espère que cela vous sera utile.

À bientôt.
